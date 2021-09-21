import BleManager, {connect} from "react-native-ble-manager";
import {stringToBytes, bytesToString} from "convert-string";
import { NativeModules, NativeEventEmitter } from "react-native";

const BleManagerModule = NativeModules.BleManager;

class NBControllerClient {

    static shared = new NBControllerClient();

    bleManager = BleManager
    bleManagerEmitter = new NativeEventEmitter(BleManagerModule);
    neededService = '0000ffe0-0000-1000-8000-00805f9b34fb';
    neededChar = '0000ffe1-0000-1000-8000-00805f9b34fb';

    scanCheckingPeriod = 500
    connectionAttempts = 5

    connected = false

    constructor() {
        this.disconnectSubscription = this.bleManagerEmitter.addListener('BleManagerDisconnectPeripheral', this.onDisconnect.bind(this))
    }

    init = () => {
        this.bleManager.start()
            .then(this.onStart.bind(this))
            .catch(this.onStartError.bind(this))
    }

    onDisconnect = (deviceId) => {
        this.connected = false
        console.log("HERE onDisconnect", deviceId)
    }
    onStart = () => console.log('BleManager started')
    onStartError = error => console.log(`BleManager start error: ${error.message}`)

    findDevice = (deviceId, searchTimeout = 5000, log = msg => {}) => {
        return new Promise((resolve, reject) => {
            this.bleManager.scan([], searchTimeout / 1000, false)
                .then(() => {
                    let intervalId = null
                    let timeoutId = setTimeout(() => {
                        clearInterval(intervalId)
                        this.cancelScan()
                        reject(new Error('device not found'))
                    }, searchTimeout)

                    intervalId = setInterval(async () => {
                        try {
                            const discoveredDevices = await BleManager.getDiscoveredPeripherals();
                            const bondedDevices = await BleManager.getBondedPeripherals()
                            const connectedDevices = await BleManager.getConnectedPeripherals();
                            const devices = [...discoveredDevices, ...bondedDevices, ...connectedDevices]
                            const device = devices.find(item => item.name === deviceId);
                            if (device) {
                                clearInterval(intervalId);
                                clearTimeout(timeoutId);
                                resolve(device);
                            }
                        } catch (error) {
                            clearInterval(intervalId)
                            clearTimeout(timeoutId)
                            reject(error)
                        }
                    }, this.scanCheckingPeriod)
                })
                .catch(reject)
        })
    }

    cancelScan = () => this.bleManager.stopScan()

    connect = async (deviceId, log = (error, msg) => {}) => {
        let error = null
        for (let i = 0; i < this.connectionAttempts; i++) {
            try {
                log(null, `connection attempt ${i + 1}`)
                await this.bleManager.connect(deviceId)
                log(null, `retrieve attempt ${i + 1}`)
                await this.bleManager.retrieveServices(deviceId);
                error = null
                break
            } catch (err) {
                log(err)
                error = err
            }
        }
        if (error) {
            throw error
        } else {
            this.connected = true
        }
    }

    send = (deviceId, command, responseTimeout = 500, short = true) => {
        return new Promise(async (resolve, reject) => {
            await this.bleManager.startNotification(device.id, this.neededService, this.neededChar);
            let response = null
            let timeoutId = null
            let subscription = null

            const listener = async ({value}) => {
                const data = bytesToString(value)
                if (short) {
                    if (subscription) subscription.remove()
                    if (timeoutId) clearTimeout(timeoutId)
                    resolve(data)
                } else {
                    response = response ? response + `${data}` : `${data}`
                }
            }

            subscription = this.bleManagerEmitter.addListener('BleManagerDidUpdateValueForCharacteristic', listener)

            try {
                await this.bleManager
                    .writeWithoutResponse(
                        deviceId,
                        this.neededService,
                        this.neededChar,
                        stringToBytes(`${command}\r\n`),
                        10
                    )
                timeoutId = setTimeout(async () => {
                    subscription.remove()
                    if (short) {
                        reject(new Error('response timeout'))
                    } else {
                        resolve(response)
                    }
                }, responseTimeout)
            } catch (error) {
                return reject(error)
            }
        })
    }

    disconnect = deviceId => this.bleManager.disconnect(deviceId)

    findAllPostmachinesNearby = (searchTimeout = 5000, log = (error, msg, data) => {}) => {
        return new Promise((resolve, reject) => {
            this.bleManager.scan([this.neededService], searchTimeout, false)
                .then(() => {
                    let intervalId = null
                    let devicesList = []
                    let timeoutId = setTimeout(() => {
                        if (intervalId) clearInterval(intervalId)
                        resolve(devicesList)
                    }, searchTimeout)

                    intervalId = setInterval(async () => {
                        try {
                            const discoveredDevices = await BleManager.getDiscoveredPeripherals();
                            const bondedDevices = await BleManager.getBondedPeripherals()
                            const connectedDevices = await BleManager.getConnectedPeripherals();
                            const devices = [...discoveredDevices, ...bondedDevices, ...connectedDevices]
                            devicesList = devices
                            log(null, "devices", devices)
                        } catch (error) {
                            clearInterval(intervalId)
                            clearTimeout(intervalId)
                            reject(error)
                        }
                    }, this.scanCheckingPeriod)
                })
                .catch(reject)
        })
    }

}

export default NBControllerClient
