declare global {
  interface BluetoothRemoteGATTCharacteristic {
    writeValue(value: BufferSource): Promise<void>;
  }

  interface BluetoothRemoteGATTService {
    getCharacteristic(
      uuid: BluetoothCharacteristicUUID,
    ): Promise<BluetoothRemoteGATTCharacteristic>;
  }

  interface BluetoothRemoteGATTServer {
    getPrimaryService(
      uuid: BluetoothServiceUUID,
    ): Promise<BluetoothRemoteGATTService>;
  }

  interface BluetoothDevice {
    gatt?: {
      connect(): Promise<BluetoothRemoteGATTServer>;
      disconnect(): void;
    };
  }

  interface Bluetooth {
    requestDevice(options: {
      filters: Array<{ services: BluetoothServiceUUID[] }>;
    }): Promise<BluetoothDevice>;
  }

  type BluetoothServiceUUID = string;
  type BluetoothCharacteristicUUID = string;

  interface USBDevice {
    configuration: USBConfiguration | null;
    open(): Promise<void>;
    close(): Promise<void>;
    selectConfiguration(configurationValue: number): Promise<void>;
    claimInterface(interfaceNumber: number): Promise<void>;
    transferOut(
      endpointNumber: number,
      data: BufferSource,
    ): Promise<USBOutTransferResult>;
  }

  interface USBConfiguration {}
  interface USBOutTransferResult {}

  interface USB {
    requestDevice(options: {
      filters: Array<{ vendorId: number; productId: number }>;
    }): Promise<USBDevice>;
  }

  interface Navigator {
    bluetooth?: Bluetooth;
    usb?: USB;
  }
}

export {};
