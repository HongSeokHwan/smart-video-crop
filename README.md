# Smart video crop
--------
The smart-video-crop is inspired by smartcrop.js (https://github.com/jwagner/smartcrop.js)
You can do content aware video crop.

# Install
--------
After install opencv, ffmpeg, imagemagick, 'npm install smart-video-crop'

# Examples
--------
    const svc = require('smart-video-crop');
    let input = {
      inFile: 'blah.mp4',
      outFile: 'blah-out.mp4',
      width: 1280,
      height: 720,
    };
    svc.crop(input); // crop video
   
    
