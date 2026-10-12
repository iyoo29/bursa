"""
AIRA - PlatformIO Extra Script
Fix: Menambahkan toolchain bin, libexec, dan target bin ke PATH secara otomatis.
Ini mengatasi masalah 'CreateProcess: No such file or directory' pada
GCC 8.4.0 di Windows karena cc1plus.exe, collect2.exe, ld.exe, dan as.exe
tidak ditemukan saat subprocess spawning.
"""

Import('env')
import os

platform = env.PioPlatform()
toolchain_dir = platform.get_package_dir("toolchain-xtensa-esp32s3")

if toolchain_dir:
    bin_dir        = os.path.join(toolchain_dir, "bin")
    libexec_dir    = os.path.join(toolchain_dir, "libexec", "gcc", "xtensa-esp32s3-elf", "8.4.0")
    target_bin_dir = os.path.join(toolchain_dir, "xtensa-esp32s3-elf", "bin")

    dirs_to_add = [bin_dir, libexec_dir, target_bin_dir]

    for path_dir in dirs_to_add:
        if os.path.isdir(path_dir):
            env.PrependENVPath("PATH", path_dir)
            if path_dir not in os.environ.get("PATH", ""):
                os.environ["PATH"] = path_dir + os.pathsep + os.environ.get("PATH", "")
            print(f"[AIRA Fix] Menambahkan ke PATH: {path_dir}")
else:
    print("[AIRA Fix] PERINGATAN: toolchain-xtensa-esp32s3 tidak ditemukan!")
