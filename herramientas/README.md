# subir.mjs

Sube un vídeo al programador de 1001 Dudas y lo programa en la siguiente franja libre. Solo necesita Node 18 o más; no hay que instalar nada.

```bash
node subir.mjs --login
```
Se hace una vez. Pide email y contraseña (los escribe Alex) y guarda la sesión, no la contraseña, en `%USERPROFILE%\.sesion-programador.json`, fuera del repo.

```bash
node subir.mjs "C:\Users\Alex\Desktop\Claude Cowork\Videos IA\videos\019-gota-bala"
```
Lee `textos.json` y `NNN-slug.mp4` de la carpeta (si pasa de 50 MB, usa `NNN-slug-web.mp4`). Las rutas con espacios van entre comillas.

Opciones: `--redes youtube,tiktok`, `--dia 2026-11-05 --franja A` y `--borrador`.

```bash
node subir.mjs --cola
```
Enseña lo que hay programado.
