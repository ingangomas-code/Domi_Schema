# Registro y confirmación

La app solicita `emailRedirectTo: https://domi-schema-studio.vercel.app/` tanto al crear una cuenta como al reenviar la confirmación. El usuario puede reenviar el mensaje desde **Nube → Reenviar confirmación** sin volver a crear la cuenta. Los errores de enlace vencido, correo pendiente y límite de envíos se muestran en español.

Configuración necesaria en Supabase → Authentication → URL Configuration:

- Site URL: `https://domi-schema-studio.vercel.app/`
- Redirect URLs: incluir exactamente `https://domi-schema-studio.vercel.app/`.
- No usar localhost como Site URL de producción. Los registros hechos desde el entorno local también regresan a producción.

Los enlaces antiguos pueden contener la dirección local anterior. Solicitar un nuevo correo después de corregir la configuración. Si el correo ya se confirmó, iniciar sesión directamente.

Para permitir registro a personas fuera del equipo del proyecto, revisar Authentication → Emails → SMTP. El remitente predeterminado de Supabase restringe los destinatarios al equipo y aplica límites bajos. Configurar un proveedor SMTP con dominio verificado antes de abrir el registro general; mantener la confirmación de correo activada.

El acceso al editor y la cuenta no implica acceso a los proveedores de IA: `AI_ALLOWED_EMAILS` controla por separado quién puede consumir las claves del servidor. No ampliar esa lista automáticamente al registrar usuarios.

Referencias: [URL Configuration](https://supabase.com/docs/guides/auth/redirect-urls), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
