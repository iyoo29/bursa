/**
 * AIRA - TFT_eSPI User Setup
 * Target: LILYGO T-Dongle S3 - ST7735 160x80 LCD
 * 
 * File ini dibaca langsung oleh library TFT_eSPI.
 * Konfigurasi ini menggantikan semua flag -D yang panjang dari platformio.ini
 * untuk menghindari Windows CreateProcess command line length error.
 */

// Driver
#define ST7735_DRIVER

// Dimensi layar fisik
#define TFT_WIDTH   80
#define TFT_HEIGHT  160

// Tipe tab ST7735 (T-Dongle S3 verifikasi: GREENTAB160x80)
#define ST7735_GREENTAB160x80

// Urutan warna
#define TFT_RGB_ORDER TFT_BGR

// Pin SPI LCD T-Dongle S3
#define TFT_MISO  -1
#define TFT_MOSI   3
#define TFT_SCLK   5
#define TFT_CS     4
#define TFT_DC     2
#define TFT_RST    1
#define TFT_BL     38
#define TFT_BACKLIGHT_ON LOW

// #define USE_FSPI_PORT

// Frekuensi SPI
#define SPI_FREQUENCY  10000000

// Font yang dimuat
#define LOAD_GLCD
#define LOAD_FONT2
#define LOAD_FONT4
#define LOAD_FONT6
#define LOAD_FONT7
#define LOAD_FONT8
#define LOAD_GFXFF
#define SMOOTH_FONT
