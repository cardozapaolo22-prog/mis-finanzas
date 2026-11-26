# Mis Finanzas — guía de instalación

Son dos partes: **Firebase** (login y base de datos) y **GitHub Pages** (la página con su link).
Toma unos 20 minutos y no cuesta nada. El plan gratis de Firebase te sobra para uso personal.

> **Antes de empezar, puedes probarla:** abre `index.html` desde GitHub Pages (Parte B) sin tocar `config.js`.
> Funciona en **modo prueba**: guarda los datos solo en ese navegador y no pide login.

---

## Parte A — Firebase

### 1. Crear el proyecto
1. Entra a **https://console.firebase.google.com** con tu cuenta de Google.
2. Haz clic en **Crear un proyecto** y ponle de nombre `mis-finanzas`.
3. Google Analytics: **desactívalo**, no hace falta. Luego **Crear proyecto**.

### 2. Registrar la app web y copiar la configuración
1. En la pantalla del proyecto, haz clic en el ícono **`</>`** (Web).
2. Como apodo, pon `Mis Finanzas`. **No** marques "Firebase Hosting". Luego **Registrar app**.
3. Te aparece un bloque `const firebaseConfig = { ... }`. Copia esos 6 valores.
4. Abre el archivo **`config.js`** y reemplaza cada `PEGA_AQUI` por su valor (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).

   Estos valores no son secretos: es normal que queden visibles. Lo que protege tus datos son las reglas del paso 4.

### 3. Activar el login con Google
1. Menú izquierdo: **Compilación → Authentication → Comenzar**.
2. En **Método de acceso**, elige **Google**, actívalo, selecciona tu correo de asistencia y haz clic en **Guardar**.
3. Ve a **Configuración → Dominios autorizados → Agregar dominio** y escribe `TU-USUARIO.github.io`, con tu usuario de GitHub.
   *Si te saltas este paso, el botón "Entrar con Google" muestra un error de dominio.*

### 4. Crear la base de datos y pegar las reglas
1. Menú izquierdo: **Compilación → Firestore Database → Crear base de datos**.
2. Ubicación: **southamerica-east1 (São Paulo)**, que es la más cercana a Lima. *No se puede cambiar después.*
3. Elige **modo de producción** y haz clic en **Crear**.
4. Ve a la pestaña **Reglas**, borra todo lo que haya, pega el contenido del archivo **`firestore.rules`** y haz clic en **Publicar**.

### 5. Darte acceso a ti
1. En Firestore, ve a la pestaña **Datos → Iniciar colección**.
2. ID de la colección: `permitidos`.
3. ID del documento: **tu correo de Gmail en minúsculas**, por ejemplo `piero@gmail.com`.
4. Agrega un campo cualquiera, por ejemplo `nombre` = `Piero`, y haz clic en **Guardar**.

### 6. (Cuando quieras) Dar acceso a otra persona
- En la colección `permitidos`, haz clic en **Agregar documento**. Como ID pon el **Gmail de esa persona** en minúsculas y agrega un campo cualquiera.
- Pásale el link. Entra con su Google y ve **solo sus datos**: tú no ves los suyos ni ella los tuyos.
- Para quitarle el acceso, borra su documento.

---

## Parte B — GitHub Pages

### 7. Subir los archivos
1. En **https://github.com/new** crea un repositorio llamado `mis-finanzas`, de tipo **Public**. Luego **Create repository**.
2. Haz clic en **uploading an existing file**.
3. Arrastra **todo el contenido de esta carpeta**, incluida la carpeta `icons`, y haz clic en **Commit changes**.

### 8. Activar la página
1. En el repositorio, ve a **Settings → Pages**.
2. En **Source**, elige **Deploy from a branch**, rama **main** y carpeta **/ (root)**. Luego **Save**.
3. Espera 1 o 2 minutos. Tu link será:
   **`https://TU-USUARIO.github.io/mis-finanzas/`**

---

## Parte C — Instalarla como app

- **Android (Chrome):** abre el link, toca el menú **⋮** y elige **Instalar app** o **Agregar a la pantalla principal**.
- **iPhone (Safari):** abre el link, toca **Compartir** y elige **Agregar a inicio**.

Aparece el ícono verde **S/** en tu pantalla. Ábrela, toca **Entrar con Google** y listo.

---

## Cómo se usa

| Pestaña | Para qué sirve |
| --- | --- |
| **Mes** | Con las flechas ‹ › cambias de mes. **+ Agregar** anota un ingreso o gasto con su categoría, planeado y real. Arriba ves el resumen y el gráfico se arma solo. |
| **Año** | Muestra el gráfico de los 12 meses y la tabla mes a mes. Toca un mes para abrirlo. |
| **Deudas** | Agrega cada deuda y registra los abonos. La barra muestra cuánto te falta. |
| **Ajustes** | Crea, renombra o quita tus categorías, descarga el año en Excel, instala la app y cierra sesión. |

**Atajo de cada mes:** cuando entras a un mes vacío, el botón **"Copiar lo planeado de [mes anterior]"** repite tus gastos fijos. Así solo llenas lo real.

**Sin internet:** la app abre igual y lo que anotes se sube solo cuando vuelve la conexión.

---

## Si quieres cambiar algo después
- **Colores:** están al inicio de `styles.css`. Cambia `--brand` para el verde principal y `--spend` para el color de los gastos.
- **Categorías iniciales:** al inicio de `app.js` (`DEF_IN` y `DEF_OUT`). Igual puedes editarlas desde la app, en Ajustes.
- **Después de subir cualquier cambio**, abre `sw.js` y sube la versión (`mf-v1` → `mf-v2`). Así los celulares toman la nueva versión.

## Problemas comunes
| Ves esto | Solución |
| --- | --- |
| "Este dominio no está autorizado" | Paso 3.3: agrega `TU-USUARIO.github.io` en Dominios autorizados. |
| "Sin acceso" después de entrar | Paso 5: el ID del documento debe ser tu correo exacto, en minúsculas. |
| "No se pudo conectar con Firebase" | Revisa que los 6 valores de `config.js` estén bien copiados, con sus comillas. |
| La página sale 404 | Espera unos minutos tras el paso 8 y revisa que `index.html` esté en la raíz del repositorio, no dentro de otra carpeta. |
| Cambié algo y el celular no lo muestra | Sube la versión en `sw.js`, cierra la app y vuelve a abrirla. |
