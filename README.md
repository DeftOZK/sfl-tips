# SFL Tips - Flask Python Only

Base tradicional con Python + Flask, sin JavaScript.

## Qué hace

- Python consulta la API pública de SFL.World.
- Flask renderiza la tabla en HTML usando Jinja.
- El buscador funciona con formulario GET.
- El botón actualizar recarga la página.
- El botón descargar CSV usa una ruta de Flask.

## Instalar

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## Ejecutar

```powershell
python app.py
```

Abre:

```text
http://127.0.0.1:5000
```
