const ffmpeg = require('fluent-ffmpeg');
const smartcrop = require('smartcrop-gm');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const log = require('loglevel');
const gm = require('gm').subClass({imageMagick: true});
const cv = require('opencv');
const easyimage = require('easyimage');
var sizeOf = require('image-size');
log.setLevel("info");


function getShape(size) {
  
  if (size.width > size.height) {
    return 'landscape';
  }
  else if (size.width < size.height) {
    return 'portrait';
  }
  else {
    return 'square';
  }
}


function isFaceExist(input) {
  
  return new Promise(function (resolve, reject) {
    cv.readImage(input, function (err, image) {
      if (err) return reject(err);
      image.detectObject(cv.FACE_CASCADE, {}, function (err, faces) {
        if (err) return reject(err);
        if (faces.length > 0) {
          resolve(true);
        }
        else {
          resolve(false);
        }
      });
    });
  });
  
}

function faceDetect(input, options) {
  return new Promise(function (resolve, reject) {
    cv.readImage(input, function (err, image) {
      if (err) return reject(err);
      image.detectObject(cv.FACE_CASCADE, {}, function (err, faces) {
        // log.error('!', input, faces);
        if (err) return reject(err);
        options.boost = faces.map(function (face) {
          return {
            x: face.x,
            y: face.y,
            width: face.width,
            height: face.height,
            weight: 1.0
          };
        });
        resolve(true);
      });
    });
  });
}


class SmartVideoCrop {
  constructor(input) {
    this.init();
    this._input = input;
  }

  init() {
    fse.removeSync('./img');
    fse.mkdirsSync('./img');
  }

  createPosters() {
    let p = new Promise((resolve, reject) => {
      ffmpeg(this._input.inFile)
        .videoFilters('fps=1')
        .output('./img/img%03d.jpg')
        .on('error', function (err, stdout, stderr) {
          reject(err);
        })
        .on('end', function () {
          log.info('Finished create poster ffmpeg process.');
          resolve(true);
        })
        .run();
    });
    return p;
  }

  _collectPosterImageNames() {
    const filter = 'jpg';
    let startPath = './img';
    let files = fs.readdirSync(startPath);
    let ret = [];
    for (let i = 0; i < files.length; i++) {
      let filename = path.join(startPath, files[i]);
      let stat = fs.lstatSync(filename);
      if (stat.isDirectory()) {
        continue;
      }
      else if (filename.indexOf(filter) >= 0) {
        ret.push(filename);
      }
    }
    return ret;
  }

  _collectImageCropInfoOne(posterImageName, options) {
    options.width = this._input.width;
    options.height = this._input.height;
    //log.info(options);
    return smartcrop.crop(posterImageName, options);
  }

  _collectImageCropInfos() {
    let posterList = this._collectPosterImageNames();
    let promiseList = [];
    for (let i = 0; i < posterList.length; ++i) {
      let poster = posterList[i];
      let options = {};
      let fd = await(faceDetect(poster, options));
      promiseList.push(this._collectImageCropInfoOne(poster, options));
    }
    return promiseList;
  }
  
  getInfo() {
    return new Promise((_s, _f)=>{
      
      let posterList = this._collectPosterImageNames();
      let ret = {
        width: 0,
        height: 0,
        faceExist: false,
        shape: 'landscape',
      };
      
      for (let i = 0; i < posterList.length; ++i) {
        let poster = posterList[i];

        let dimensions = sizeOf(poster);
        ret.width = dimensions.width;
        ret.height = dimensions.height;
        ret.shape = getShape(ret);
        let faceExist = await(isFaceExist(poster));
        if (faceExist) {
          ret.faceExist = faceExist;
          _s(ret);
        }
      }
      _s(ret);
    });
  }

  getImageCropInfo() {
    let cropInfos = await(this._collectImageCropInfos());
    let ret = {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      count: 0,
    };
    cropInfos.forEach(function (raw) {
      let cropInfo = raw.topCrop;
      ret.count += 1;
      ret.x += cropInfo.x;
      ret.y += cropInfo.y;
      ret.width += cropInfo.width;
      ret.height += cropInfo.height;
    });

    ret.x = ret.x / ret.count;
    ret.y = ret.y / ret.count;
    ret.width = ret.width / ret.count;
    ret.height = ret.height / ret.count;
    return ret;
  }

  convertVideo(cropInfo) {
    let x = cropInfo.x;
    let y = cropInfo.y;
    let w = cropInfo.width;
    let h = cropInfo.height;

    let cropOption = `crop=${w}:${h}:${x}:${y}`;

    log.debug(cropOption);
    let r = /[^\/]*$/;
    let tmpFile = this._input.outFile.replace(r, '') + 'tmp.mp4';
    this._input.tmpFile = tmpFile;

    return new Promise((resolve, reject) => {

      ffmpeg(this._input.inFile)
        .videoFilters(cropOption)
        .on('error', function (err, stdout, stderr) {
          log.error('Crop video error', err);
          // console.log(err, stdout, stderr);
          reject(err);
        })
        .on('end', function () {
          log.info('Finished crop video ffmpeg process');
          resolve(true);
        })
        .output(this._input.tmpFile)
        .run();

    });
  }

  resizeVideo() {
    let w = this._input.width;
    let h = this._input.height;
    let sizeInfo = `${w}x${h}`;
    return new Promise((resolve, reject) => {
      ffmpeg(this._input.tmpFile)
      .size(`${w}x${h}`)
      .on('error', function (err, stdout, stderr) {
        log.error('Crop video error', err);
        // console.log(err, stdout, stderr);
        reject(err);
      })
    .on('end', function () {
      log.info('Finished crop video ffmpeg process');
      resolve(true);
    })
    .output(this._input.outFile)
      .run();
    });
  }
}

let cropImage = async(function (input) {
  return new Promise((_s, _f) => {
    if (input.stupid) {
      log.info('stupid mode crop image.');
      let param = {
        src: input.inFile,
        dst: input.outFile,
        width: input.width,
        height: input.height,
        cropwidth: input.width,
        cropheight: input.height,
        fill: true,
      };
      await(easyimage.rescrop(param));
    }
    else {
      let options = {
        width: input.width,
         height: input.height,
      };

      let fd = await(faceDetect(input.inFile, options));
      let result = await(smartcrop.crop(input.inFile, options));

      let tc = result.topCrop;
      let param = {
        src: input.inFile,
         dst: input.outFile,
         cropwidth: tc.width,
         cropheight: tc.height,
         width: input.width,
         height: input.height,
         gravity: 'NorthWest',
         x: tc.x,
         y: tc.y
      };
      await(easyimage.crop(param));
      await(easyimage.resize({
        src: input.outFile,
        dst: input.outFile,
        width: input.width,
        height: input.height,
      }));
    }
  _s(true);
  });
});

let cropVideo = async(function (input) {
  return new Promise((rs, rj) => {
    let videoCrop = new SmartVideoCrop(input);
    await(videoCrop.createPosters());
    let cropInfo = await(videoCrop.getImageCropInfo());
    await(videoCrop.convertVideo(cropInfo));
    await(videoCrop.resizeVideo());
    rs(true);
  });
});

let getInfo = async(function (fileName) {
  if (fileName.indexOf('.mp4') >= 0) {
    let input = {
      inFile: fileName,
    };
    let videoCrop = new SmartVideoCrop(input);
    await(videoCrop.createPosters());
    let info = await(videoCrop.getInfo());
    info.fileName = fileName;
    return info;
  }
    
  else if (fileName.indexOf('.jpg') >= 0) {
    let ret = {
      width: 0,
      height: 0,
      faceExist: 0,
      fileName: fileName,
      shape: 'square',
    };

    let size = sizeOf(fileName);
    ret.width = size.width;
    ret.height = size.height;
    ret.faceExist = await(isFaceExist(fileName));
    ret.shape = getShape(size);
    return ret;
  }
  else {
    log.error('Not supported file type:', fileName);
  }
  return null;
});


exports.crop = cropVideo;
exports.cropVideo = cropVideo;
exports.cropImage = cropImage;
exports.getInfo = getInfo;
exports.getShape = getShape;


if (require.main === module) {

  let input = {
    inFile: '1.mp4',
    outFile: 'outfile.mp4',
    width: 1280,
    height: 720,
  };
  
  cropVideo(input);
}

