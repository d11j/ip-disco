import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { Gpio } from 'onoff';
import Axios from 'axios';
import FormData from 'form-data';
import { StillCamera, AwbMode } from "pi-camera-connect";
import { spawn } from "child_process"
import { readFileSync } from 'fs';
process.env["NODE_CONFIG_DIR"] = dirname(fileURLToPath(import.meta.url)) + "/config/";
console.log(process.env["NODE_CONFIG_DIR"]);
import Config from 'config';

// const cooltime = 10000;

const cam = new StillCamera({
    width: 640,
    height: 480,
    delay: 200,
    awbMode: AwbMode.Auto,
});

const button = new Gpio(Config.get('gpio.pin'), 'in', 'both');

let last_pressed = 0;
let release_reported = true;

const disco = (msg) => {
    Axios.post(Config.get('discord.webhookUrl'), { content: msg })
        .then((response) => { console.log(response.status); })
        .catch((reason) => { console.error(reason); });
};

const takeShot = () => {
    cam.takeImage().then((image) => {
        const formdata = new FormData();
        formdata.append('file', image, { filename: 'out.jpg', contentType: 'image/jpeg', knownLength: image.length });
        Axios.post(Config.get('discord.webhookUrl'),
            formdata.getBuffer(), { headers: formdata.getHeaders() }
        ).catch((error) => { console.log(error); })
    }).catch((error) => {
        disco('写真撮るの失敗した\r\n' + error);
    });
}

const takeShotStill = () => {
    let proc = spawn('libcamera-jpeg', ['-n', '-t', '1', '--width', '640', '--height', '480', '-o', 'still.jpg']);
    proc.stderr.on('data', (data) => {
        console.log(data.toString());
    });
    proc.stdout.on('data', (data) => {
        console.log(data.toString());
    });
    proc.on("close", (code, sig) => {
        if (code == 0) {
            const image = readFileSync('still.jpg');
            const formdata = new FormData();
            formdata.append('file', image, { filename: 'out.jpg', contentType: 'image/jpeg', knownLength: image.length });
            Axios.post(Config.get('discord.webhookUrl'),
                formdata.getBuffer(), { headers: formdata.getHeaders() }
            ).catch((error) => { console.log(error); })
        } else {
            disco(`写真撮るの失敗した\r\nchild process returns: ${code}`);
        }
    });
}

button.watch(function (err, state) {
    if (state == 0 && release_reported) {
        //  && ((Date.now() - last_pressed) > cooltime)
        console.log("pressed.");
        disco('インターホン呼出し (' + new Date().toLocaleString() + ')');
        last_pressed = Date.now();
        release_reported = false;

        setTimeout(() => {
            if (!release_reported) {
                // takeShot();
                takeShotStill();
            }
        }, Config.get('camera.snapWait'));

    } else if (state == 1 && !release_reported) {
        release_reported = true;
        let pressed_time = Date.now() - last_pressed;
        disco('メークしてた時間: ' + pressed_time + ' [ms]')
    }
});
disco('サービス起動: ' + JSON.stringify(process.argv));
