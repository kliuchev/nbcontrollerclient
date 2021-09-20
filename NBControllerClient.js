import BleManager from "react-native-ble-manager";
import {stringToBytes, bytesToString} from "convert-string";
import { NativeModules, NativeEventEmitter } from "react-native";

const BleManagerModule = NativeModules.BleManager;

class NBControllerClient {

    static shared = new NBControllerClient();

    bleManager = BleManager;
    bleManagerEmitter = new NativeEventEmitter(BleManagerModule);
    neededService = '0000ffe0-0000-1000-8000-00805f9b34fb';
    neededChar = '0000ffe1-0000-1000-8000-00805f9b34fb';


    constructor() {
        this.bleManagerEmitter.addListener('BleManagerDisconnectPeripheral', this.onDisconnect.bind(this))
    }

    init = () => {
        BleManager.start()
            .then(this.onStart.bind(this))
            .catch(this.onStartError.bind(this))
    }

    onDisconnect = (deviceId) => {
        console.log("HERE onDisconnect", deviceId)
    }

    onStart = () => {}
    onStartError = error => {}

    findDevice = (postmachineName, timeout = 3000, checkPeriod = 500) => {
        return new Promise((resolve, reject) => {
            this.bleManager.scan([], timeout / 1000, false)
                .then(() => {
                    let intervalId = null;
                    let timeoutId = setTimeout(() => {
                        clearInterval(interval);
                        reject(new Error('device not found'));
                    }, timeout);

                    intervalId = setInterval(async () => {
                        try {
                            const discoveredDevices = await this.bleManager.getDiscoveredPeripherals();
                            const bondedDevices = await this.bleManager.getBondedPeripherals()
                            const connectedDevices = await this.bleManager.getConnectedPeripherals();
                            const devices = [ ...discoveredDevices, ...bondedDevices, ...connectedDevices];
                            const device = devices.find(item => item.name === postmachineName);
                            if (device) {
                                clearInterval(intervalId)
                                clearTimeout(timeoutId)
                                await this.cancelScan()
                                resolve(device)
                            }
                        } catch (error) {
                            clearInterval(intervalId);
                            clearTimeout(timeoutId);
                            await this.cancelScan()
                            reject(error);
                        }
                    }, checkPeriod);
                })
                .catch(reject)
        })
    }

    cancelScan = () => this.bleManager.stopScan()

    send = (device, command, responseTime = 500, short = false) => {
        return new Promise(async (resolve, reject) => {
            let listener = null;
            let timeoutId = null;
            let response = null;
            listener = async ({value}) => {
                const data = bytesToString(value)
                if (short) {
                    this.bleManagerEmitter.removeListener("BleManagerDidUpdateValueForCharacteristic", listener)
                    clearTimeout(timeoutId)
                    resolve(data)
                } else {
                    response = response ? response += data : data
                }
            }

            this.bleManagerEmitter.addListener("BleManagerDidUpdateValueForCharacteristic", listener)
            try {
                await BleManager.writeWithoutResponse(
                    device.id,
                    this.neededService,
                    this.neededChar,
                    stringToBytes(`${command}\r\n`),
                    10
                );

                timeoutId = setTimeout(async () => {
                    this.bleManagerEmitter.removeListener("BleManagerDidUpdateValueForCharacteristic", listener)
                    if (short) {
                        reject("response timeout")
                    } else {
                        if (response === null) {
                            reject("response timout");
                        } else {
                            resolve(response)
                        }
                    }
                }, responseTime)
            } catch (error) {
                this.bleManagerEmitter.removeListener("BleManagerDidUpdateValueForCharacteristic", listener)
                reject(error)
            }
        });
    }

    disconnect = id => this.bleManager.disconnect(id)

    connect = async (deviceId, attemptsCount = 5) => {
        let connected = false
        for (let i = 0; i < attemptsCount; i++) {
            try {
                await this.bleManager.connect(deviceId)
                connected = true
                break
            } catch (error) {
                console.log({ error })
            }
        }
        if (!connected) {
            throw new Error('not connected')
        }
    }
}

export default NBControllerClient
