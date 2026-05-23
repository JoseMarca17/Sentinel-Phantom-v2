import serial
import json
import time

def enviar_comando(puerto, modulo, comando, parametros=None):
    try:
        # Abrimos el puerto con un timeout más largo (6 segundos) para darle tiempo al bucle del TV-B-Gone
        with serial.Serial(puerto, 115200, timeout=6) as ser:
            time.sleep(2) # Esperar a que el ESP32 se resetee/estabilice al abrir el puerto
            ser.reset_input_buffer()
            
            paquete = {
                "mod": modulo,
                "cmd": comando,
                "params": parametros or {}
            }
            
            # Manda la orden al ESP32
            ser.write((json.dumps(paquete) + '\n').encode('utf-8'))
            ser.flush()
            
            print(f"[*] Comando [{comando}] enviado. Procesando en el hardware...")
            
            # Bucle de lectura de respuesta
            start_time = time.time()
            while (time.time() - start_time) < 6:
                if ser.in_waiting > 0:
                    linea = ser.readline().decode('utf-8', errors='ignore').strip()
                    if linea.startswith('{'):
                        try:
                            respuesta = json.loads(linea)
                            return respuesta
                        except json.JSONDecodeError:
                            continue
                time.sleep(0.1)
                
            return {"success": False, "error": "Timeout esperando respuesta del ESP32"}
    except Exception as e:
        return {"success": False, "error": str(e)}

def menu():
    puerto_serial = "/dev/ttyUSB0"
    print("\n[+] Conexión serial establecida en", puerto_serial)
    print("\n--- MENÚ DE PRUEBAS INFRARROJO (IR) ---")
    print("1. Capturar código de control remoto")
    print("2. Ejecutar secuencia de apagado universal (TV-B-Gone)")
    
    opcion = input("Selecciona una opción: ")
    
    if opcion == "1":
        print("[*] Receptor activo. Presione un botón en su control remoto de TV...")
        res = enviar_comando(puerto_serial, "IR", "CAPTURE")
        print("\n[IR REPORTE] ->", res)
    elif opcion == "2":
        print("[*] Transmitiendo códigos de apagado universal por el diodo TX...")
        res = enviar_comando(puerto_serial, "IR", "TV_B_GONE") # Asegúrate que el cmd coincida con tu switch-case del ESP32
        print("\n[IR REPORTE] ->", res)
    else:
        print("[-] Opción inválida.")

if __name__ == "__main__":
    menu()
