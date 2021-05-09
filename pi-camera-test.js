const snap_path = `${__dirname}/test1.jpg`;

const fs = require('fs');
const PiCamera = require('pi-camera');
const cam = new PiCamera({
    mode: 'photo',
    output: snap_path,
    width: 640,
    height: 480,
    nopreview: true
});

const takeShot = () => {
    const start_time = Date.now();
    cam.snap().then((result) => {
        console.log('captured. time: ' + (Date.now() - start_time));
    }).catch((error) => {
        console.error('写真撮るの失敗した\r\n' + error);
    });
};

const run = () => {
    takeShot();
}

run();