import { spawn } from "child_process";
import Config from 'config';
import { readFileSync } from 'fs';
import { Gpio } from 'onoff';
import { dirname } from 'path';
import { AwbMode, StillCamera } from "pi-camera-connect";
import { fileURLToPath } from 'url';

process.env["NODE_CONFIG_DIR"] = dirname(fileURLToPath(import.meta.url)) + "/config/";

// カメラ設定
const cam = new StillCamera({
    width: 640,
    height: 480,
    delay: 200,
    awbMode: AwbMode.Auto,
});

// インターホンA接点入力設定
const button = new Gpio(Config.get('gpio.pin'), 'in', 'both');

let last_pressed = 0;
let release_reported = true;

/**
 * Discordにテキストメッセージを送信します。
 * @param {string} msg - 送信するメッセージ
 */
const disco = async (msg) => {
    const webhookUrl = Config.get('discord.webhookUrl');
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: msg }),
        });

        if (response.ok) {
            console.log('Discord webhook status:', response.status);
        } else {
            const errorText = await response.text();
            console.error(`Failed to send message to Discord: ${response.status} ${response.statusText}`, errorText);
        }
    } catch (error) {
        console.error('Failed to send message to Discord:', error.message);
    }
};

/**
 * libcamera-jpegを使用して写真を撮影し、Discordにアップロードします。
 */
const takeShotStill = () => {
    const imageFileName = 'still.jpg'; // 一時ファイル名
    // libcamera-jpegプロセスを起動
    let proc = spawn('libcamera-jpeg', ['-n', '-t', '1', '--width', '640', '--height', '480', '-o', imageFileName]);
    let stderrOutput = ''; // 標準エラー出力をキャプチャ

    // 標準エラー出力のデータを受信
    // proc.stderr.on('data', (data) => {
    //     stderrOutput += data.toString();
    //     console.error('libcamera-jpeg stderr:', data.toString());
    // });
    // 標準出力のデータを受信 (通常、libcamera-jpegはほとんど出力しません)
    // proc.stdout.on('data', (data) => {
    //     console.log('libcamera-jpeg stdout:', data.toString());
    // });
    // プロセスが終了したときの処理
    proc.on("close", async (code, sig) => {
        if (code === 0) { // 成功した場合
            try {

                const imageBuf = readFileSync(imageFileName);
                const imageBlob = new Blob([imageBuf], { type: 'image/jpeg'});

                const formdata = new FormData();
                // FormDataにファイルを添付
                formdata.append('file', imageBlob, 'out.jpg');

                const webhookUrl = Config.get('discord.webhookUrl');

                // 画像をアップロード
                const response = await fetch(webhookUrl, {
                    method: 'POST',
                    body: formdata
                });

                if (response.ok) {
                    console.log('Discord image upload status:', response.status);
                } else {
                    const errorText = await response.text();
                    console.error(`Failed to upload image to Discord: ${response.status} ${response.statusText}`, errorText);
                    disco(`写真アップロード失敗: ${response.status} ${response.statusText}: ${errorText}`);
                }

            } catch (fsError) {
                // ファイル読み込みエラーが発生した場合
                console.error('Failed to read image file:', fsError);
                disco(`写真ファイルの読み込みに失敗しました: ${fsError.message}`);
            }
        } else { // 撮影に失敗した場合
            console.error(`libcamera-jpeg process exited with code ${code}. Stderr: ${stderrOutput}`);
            disco(`写真撮るの失敗した (終了コード: ${code}). エラー詳細:\r\n${stderrOutput || 'N/A'}`);
        }
    });
};

// GPIOの監視
button.watch(function (err, state) {
    if (err) {
        console.error('GPIO watch error:', err);
        return;
    }

    if (state === 0 && release_reported) {
        // インターホンの接点がメークした時
        console.log("インターホンのA接点がメーク");
        disco('インターホン呼出し (' + new Date().toLocaleString() + ')');
        last_pressed = Date.now();
        release_reported = false;

        // 設定された待機時間の後に写真を撮影
        setTimeout(() => {
            // A接点がブレークしてなかったら撮影
            if (!release_reported) {
                takeShotStill();
            }
        }, Config.get('camera.snapWait'));

    } else if (state === 1 && !release_reported) {
        // インターホンの接点がブレークした時
        release_reported = true;
        let pressed_time = Date.now() - last_pressed;
        disco('メークしてた時間: ' + pressed_time + ' [ms]')
    }
});

// サービス起動時にDiscordに通知
disco('サービス起動: ' + JSON.stringify(process.argv));

// プロセス終了時のクリーンアップ
process.on('SIGINT', _ => {
    button.unexport(); // GPIOピンを解放
    console.log('GPIO unexported. Exiting.');
    process.exit(0);
});