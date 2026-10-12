/**
 * AIRA Firmware - Pengelola ID Perangkat
 * 
 * Menghasilkan ID perangkat unik berdasarkan MAC address ESP32-S3.
 * Format: AIRA-TD-XXXX (4 karakter hex terakhir dari MAC address)
 */

#ifndef AIRA_DEVICE_ID_H
#define AIRA_DEVICE_ID_H

#include <Arduino.h>

class DeviceID {
public:
    /**
     * Menginisialisasi dan menghasilkan ID perangkat dari MAC hardware.
     */
    static void init();

    /**
     * Mendapatkan string ID perangkat.
     * @return ID Perangkat seperti "AIRA-TD-A1B2"
     */
    static String getID();

    /**
     * Mendapatkan string alamat MAC lengkap.
     * @return Alamat MAC seperti "AA:BB:CC:DD:EE:FF"
     */
    static String getMAC();

private:
    static String _deviceId;
    static String _macAddress;
    static bool _initialized;
};

#endif // AIRA_DEVICE_ID_H
