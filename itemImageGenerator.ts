import {ImageGenerator} from "./modules/imageGenerator/imageGenerator";
import {GameFeature} from "./modules/constants/const";
import {WebsiteImageGeneratorBase} from "./websiteImageGeneratorBase";
import {OtbManager} from "./modules/otbFile/otbManager";
import {DatManager} from "./modules/datFile/datManager";
import {SpriteManager} from "./modules/sprFile/spriteManager";

let GIF = require('gif.js');

class ItemImageGenerator extends WebsiteImageGeneratorBase {
    private onlyPickupableCheckbox: HTMLInputElement;
    private forceEnableExtendedSpritesCheckbox: HTMLInputElement;

    private onlyPickupable = true;

    init() {
        super.init();
        this.onlyPickupableCheckbox = <HTMLInputElement>document.getElementById('onlyPickupable');
        this.forceEnableExtendedSpritesCheckbox = <HTMLInputElement>document.getElementById('forceEnableExtendedSprites');
    }

    afterSetClientVersion() {
        if (this.forceEnableExtendedSpritesCheckbox.checked) {
            this.client.enableFeature(GameFeature.GameSpritesU32);
        }
    }

    startImageGenerator(imageGenerator: ImageGenerator, otbManager: OtbManager, datManager: DatManager, spriteManager: SpriteManager, zip) {
        this.onlyPickupable = this.onlyPickupableCheckbox.checked;
        this.generateItemImage(imageGenerator, zip, 0);
    }

    generateItemImage(imageGenerator: ImageGenerator, zip, serverId: number) {
        const self = this;
        this.progressValue(serverId, this.otbManager.getLastId());
        if (serverId > this.otbManager.getLastId()) {
            this.progressText('Packing images to ZIP file, please wait (it may take a while)');
            zip.generateAsync({type: "blob"}).then(function (blob: Blob) {
                console.log('zip size', blob.size);
                self.progressText('ZIP generated, it should start download now.');
                self.downloadBlob('items.zip', blob);
            });
            return;
        }

        if (!this.otbManager.isValidOtbId(serverId)) {
            setTimeout(function () {
                self.generateItemImage(imageGenerator, zip, serverId + 1);
            }, 1);
            return;
        }

        const clientItemId = this.otbManager.getItem(serverId).getClientId();
        if (!clientItemId) {
            console.log('otb ID not mapped to any dat ID', serverId);
            setTimeout(function () {
                self.generateItemImage(imageGenerator, zip, serverId + 1);
            }, 1);
            return;
        }
        let itemThingType = this.datManager.getItem(clientItemId);
        if (!itemThingType) {
            console.log('dat ID not found in dat file', serverId, clientItemId);
            setTimeout(function () {
                self.generateItemImage(imageGenerator, zip, serverId + 1);
            }, 1);
            return;
        }
        if (this.onlyPickupable && !itemThingType.isPickupable()) {
            console.log('skip not pickupable', serverId);
            setTimeout(function () {
                self.generateItemImage(imageGenerator, zip, serverId + 1);
            }, 1);
            return;
        }

        const itemSprite = imageGenerator.generateItemImageByServerId(serverId);
        if (!itemSprite) {
            setTimeout(function () {
                self.generateItemImage(imageGenerator, zip, serverId + 1);
            }, 1);
            return;
        }

        const canvas = <HTMLCanvasElement>document.createElement('canvas');
        canvas.width = itemSprite.getWidth();
        canvas.height = itemSprite.getHeight();
        document.getElementsByTagName('body')[0].appendChild(canvas);
        const ctx = canvas.getContext("2d");
        const palette = ctx.getImageData(0, 0, itemSprite.getWidth(), itemSprite.getHeight());
        palette.data.set(new Uint8ClampedArray(itemSprite.getPixels().m_buffer.buffer));
        ctx.putImageData(palette, 0, 0);

        if (self.imageFormat == 'png') {
            const callback = function (blob) {
                canvas.remove();
                zip.file('items/' + serverId + '.png', blob);
                setTimeout(function () {
                    self.generateItemImage(imageGenerator, zip, serverId + 1);
                }, 1);

            };
            canvas.toBlob(callback);
        } else {
            const gif = new GIF({
                workers: 1,
                quality: 10,
                width: itemSprite.getWidth(),
                height: itemSprite.getHeight(),
                workerScript: './js/gif.worker.js',
                transparent: 'rgba(0,0,0,0)'
            });

            gif.addFrame(canvas, {copy: true});
            canvas.remove();

            gif.on('finished', function (blob) {
                zip.file(serverId + '.gif', blob);
                setTimeout(function () {
                    self.generateItemImage(imageGenerator, zip, serverId + 1);
                }, 1);

            });

            gif.render();
        }
    }
}

const itemImageGenerator = new ItemImageGenerator();
itemImageGenerator.init();
