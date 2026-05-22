const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegloc = require('@ffmpeg-installer/ffmpeg');
const WebP = require('node-webpmux');
const MediaExtractor = require('../../utils/mediaExtractor');
const { ensureCommandCacheDir } = require('../../utils/commandCachePaths');

ffmpeg.setFfmpegPath(ffmpegloc.path);

function ensureCache() {
    return ensureCommandCacheDir('sticker');
}

function tmpName(ext = '.webp') {
    return path.join(ensureCache(), `${randomBytes(8).toString('hex')}${ext}`);
}

function cleanupSafe(file) {
    try {
        if (file && fs.existsSync(file)) fs.unlinkSync(file);
    } catch {
        // ignore cleanup error
    }
}

async function extractFrames(inputBuffer, outputPath, prefix = 'frame') {
    if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { recursive: true });
    const img = new WebP.Image();
    await img.load(inputBuffer);
    if (!img.anim) throw new Error("This image isn't an animation");
    await img.demux({ path: outputPath, prefix });
    return img;
}

function duplicateFrames(folder, prefix, duration, fps) {
    const files = fs.readdirSync(folder).filter((file) => file.startsWith(prefix) && file.endsWith('.webp'));
    const totalFrames = Math.floor(duration * fps);
    if (totalFrames <= files.length) return;

    for (let i = files.length; i < totalFrames; i++) {
        const src = path.join(folder, `${prefix}_${i % files.length}.webp`);
        const dest = path.join(folder, `${prefix}_${i}.webp`);
        fs.copyFileSync(src, dest);
    }
}

async function makeMP4(folder, prefix, fps = 10, duration = null) {
    const outFile = tmpName('.mp4');
    return new Promise((resolve) => {
        const video = ffmpeg()
            .input(path.join(folder, `${prefix}_%d.webp`))
            .inputOptions(`-framerate ${fps}`)
            .videoCodec('libx264')
            .outputOptions(
                '-pix_fmt', 'yuv420p',
                '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                '-movflags', '+faststart'
            )
            .output(outFile);

        if (duration) video.duration(duration);

        video
            .on('end', () => resolve(outFile))
            .on('error', (err) => {
                console.error('FFmpeg error:', err);
                resolve(null);
            })
            .run();
    });
}

async function makeStaticMP4FromImageBuffer(imageBuffer, fps = 10, duration = 4) {
    const inputFile = tmpName('.png');
    const outFile = tmpName('.mp4');
    fs.writeFileSync(inputFile, imageBuffer);

    return new Promise((resolve) => {
        ffmpeg()
            .input(inputFile)
            .inputOptions(['-loop 1'])
            .duration(duration)
            .fps(fps)
            .videoCodec('libx264')
            .outputOptions(
                '-pix_fmt', 'yuv420p',
                '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                '-movflags', '+faststart'
            )
            .output(outFile)
            .on('end', () => {
                cleanupSafe(inputFile);
                resolve(outFile);
            })
            .on('error', (err) => {
                console.error('FFmpeg static Lottie preview error:', err);
                cleanupSafe(inputFile);
                cleanupSafe(outFile);
                resolve(null);
            })
            .run();
    });
}

function guessInputExtension(mimetype = '') {
    const normalized = String(mimetype || '').toLowerCase();
    if (normalized.includes('webm')) return '.webm';
    if (normalized.includes('quicktime') || normalized.includes('mov')) return '.mov';
    if (normalized.includes('matroska') || normalized.includes('mkv')) return '.mkv';
    if (normalized.includes('gif')) return '.gif';
    return '.mp4';
}

async function makeGifReadyMP4FromVideoBuffer(videoBuffer, mimetype, fps = 15, duration = null) {
    const inputFile = tmpName(guessInputExtension(mimetype));
    const outFile = tmpName('.mp4');
    fs.writeFileSync(inputFile, videoBuffer);

    return new Promise((resolve) => {
        const command = ffmpeg(inputFile)
            .noAudio()
            .fps(fps)
            .videoCodec('libx264')
            .outputOptions(
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
            )
            .output(outFile);

        if (duration) command.duration(duration);

        command
            .on('end', () => {
                cleanupSafe(inputFile);
                resolve(outFile);
            })
            .on('error', (err) => {
                console.error('FFmpeg gif-ready video error:', err);
                cleanupSafe(inputFile);
                cleanupSafe(outFile);
                resolve(null);
            })
            .run();
    });
}

module.exports = {
    name: 'togif',
    description: '\u{1F9E9} Converte sticker animado ou video em GIF/MP4',
    category: 'sticker',
    aliases: ['toggif', 'gif'],
    react: true,

    async execute(sock, messageData, args = []) {
        const {
            from,
            quoteThis,
            mediaData,
            decryptedMedia,
            prefix
        } = messageData;

        if (args[0]?.toLowerCase() === 'help' || args[0] === '-help') {
            const helpText =
                `Comando ${prefix}togif\n\n` +
                `- ${prefix}togif: Sticker animado ou video -> MP4 com gifPlayback\n` +
                `- Funciona no video enviado com legenda ou respondendo a uma midia\n` +
                `- Opcoes:\n` +
                `  --fps <numero>: frames por segundo (padrao 10, max 60)\n` +
                `  --time <numero>: duracao em segundos (padrao dura o sticker)\n\n` +
                `Exemplo: ${prefix}togif --fps 15 --time 8`;
            await sock.sendMessage(from, { text: helpText }, { quoted: quoteThis });
            return;
        }

        const fpsArg = args.includes('--fps') ? Math.min(Number(args[args.indexOf('--fps') + 1]) || 10, 60) : 10;
        const timeArg = args.includes('--time') ? Math.min(Number(args[args.indexOf('--time') + 1]) || 10, 30) : null;

        const payload = decryptedMedia || mediaData || await MediaExtractor.extractFromQuotedMessage(messageData);
        if (!payload || !Buffer.isBuffer(payload.buffer)) {
            await sock.sendMessage(from, {
                text: 'Envie ou responda a um sticker animado, Lottie ou video para converter.'
            }, { quoted: quoteThis });
            return;
        }

        const tempFolder = tmpName('');
        fs.mkdirSync(tempFolder, { recursive: true });

        let output = null;

        try {
            if (payload.type === 'video') {
                output = await makeGifReadyMP4FromVideoBuffer(
                    payload.buffer,
                    payload.mimetype,
                    Math.max(1, fpsArg),
                    timeArg
                );

                if (!output) {
                    throw new Error('Falha ao preparar o video com gifPlayback.');
                }

                await sock.sendMessage(from, {
                    video: { url: output },
                    mimetype: 'video/mp4',
                    caption: payload.gifPlayback
                        ? 'Video reenviado com gifPlayback.'
                        : 'Video convertido em GIF.',
                    gifPlayback: true
                }, { quoted: quoteThis });
                return;
            }

            if (payload.isLottie || /application\/was/i.test(payload.mimetype || '')) {
                const extracted = await extractEmbeddedImageFromLottieBuffer(payload.buffer);
                output = await makeStaticMP4FromImageBuffer(extracted.buffer, fpsArg, timeArg || 4);

                if (!output) {
                    throw new Error('Falha ao gerar uma previa de video para a figurinha Lottie.');
                }

                await sock.sendMessage(from, {
                    video: { url: output },
                    mimetype: 'video/mp4',
                    caption: 'Lottie convertida em video estatico (previa)',
                    gifPlayback: true
                }, { quoted: quoteThis });
                return;
            }

            let isAnimated = true;
            try {
                await extractFrames(payload.buffer, tempFolder);
            } catch {
                isAnimated = false;
            }

            if (!isAnimated) {
                await sock.sendMessage(from, {
                    text: `Esse sticker nao e animado.\n\nUse ${prefix}toimg para transformar figurinha em imagem ou responda a um video para usar ${prefix}togif.`
                }, { quoted: quoteThis });
                return;
            }

            if (timeArg) duplicateFrames(tempFolder, 'frame', timeArg, fpsArg);

            output = await makeMP4(tempFolder, 'frame', fpsArg, timeArg);
            if (!output) throw new Error('Falha ao converter o sticker em GIF');

            await sock.sendMessage(from, {
                video: { url: output },
                mimetype: 'video/mp4',
                caption: 'Sticker convertido',
                gifPlayback: true
            }, { quoted: quoteThis });
        } catch (err) {
            console.error('togif error:', err);
            await sock.sendMessage(from, {
                text: `Ocorreu um erro: ${err.message || err}`
            }, { quoted: quoteThis });
        } finally {
            fs.rmSync(tempFolder, { recursive: true, force: true });
            cleanupSafe(output);
        }
    }
};
