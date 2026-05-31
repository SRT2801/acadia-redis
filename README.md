# Acadia Redis - Microservicio de Notificaciones

Microservicio de notificaciones en tiempo real utilizando Redis como almacenamiento en caché y Socket.io para comunicación WebSocket.

## Arquitectura

```
┌─────────────────────────────────────────┐
│           acadia-backend                │
│   (Envía notificaciones via HTTP POST)  │
└─────────────────┬───────────────────────┘
                  │ HTTP
                  ▼
┌─────────────────────────────────────────┐
│          acadia-redis :4001             │
│  ┌─────────────────────────────────────┐│
│  │  Redis (ioredis)                    ││
│  │  - notifications:unread:{userId}    ││
│  │  - notifications:user:{userId}      ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │  WebSocket Gateway (/notifications)  ││
│  │  - notification:created             ││
│  │  - Room: user:{userId}              ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
                  │
                  │ WebSocket
                  ▼
┌─────────────────────────────────────────┐
│          acadia-frontend                │
│   (Recibe notificaciones en tiempo real)│
└─────────────────────────────────────────┘
```

## Características

- **Almacenamiento en Redis**: Notificaciones almacenadas con TTL automático
- **Tiempo real**: WebSocket para notificaciones instantáneas
- **TTL Strategy**:
  - No leídas: 30 días
  - Leídas: 7 días
- **Cleanup automático**: Cron job cada 6 horas
- **Autenticación JWT**: Protección en todos los endpoints REST

## Requisitos

- Node.js 20+
- Docker (opcional)
- Redis 7+

## Instalación

### Usando Docker (Recomendado)

```bash
# Crear archivo .env basado en .env.example
cp .env.example .env

# Iniciar Redis y el microservicio
docker-compose up -d
```

### Localmente

```bash
# Instalar dependencias
npm install

# Crear archivo .env
cp .env.example .env

# Iniciar Redis localmente o actualizar REDIS_HOST en .env

# Ejecutar en desarrollo
npm run start:dev

# Ejecutar en producción
npm run build
npm run start:prod
```

## Configuración

Variables de entorno en `.env`:

| Variable | Descripción | Default |
|----------|-------------|---------|
| `REDIS_HOST` | Host de Redis | localhost |
| `REDIS_PORT` | Puerto de Redis | 6379 |
| `JWT_SECRET` | Clave secreta para JWT | - |
| `HTTP_PORT` | Puerto del microservicio | 4001 |
| `NOTIFICATION_TTL_READ` | TTL para leídas (segundos) | 604800 (7 días) |
| `NOTIFICATION_TTL_UNREAD` | TTL para no leídas (segundos) | 2592000 (30 días) |
| `CLEANUP_CRON` | Cron para cleanup | 0 */6 * * * |

## API Endpoints

### WebSocket

**Namespace**: `/notifications`

**Eventos**:
- `notification:created` - Nueva notificación (enviado al cliente)
- `connection` - Requiere token JWT en `auth.token` o `query.token`

### REST API

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/notifications/push` | Enviar notificación |
| GET | `/notifications/unread-count/:userId` | Contador no leídas |
| PATCH | `/notifications/unread-count/:userId/reset` | Resetear contador |
| GET | `/notifications/:userId` | Lista notificaciones |
| PATCH | `/notifications/:userId/read/:notificationId` | Marcar como leída |
| PATCH | `/notifications/:userId/read-all` | Marcar todas como leídas |
| PATCH | `/notifications/:userId/channel/:channelId/read` | Marcar por canal |

### Ejemplo: Push Notificación

```bash
curl -X POST http://localhost:4001/notifications/push \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "userId": 1,
    "notification": {
      "id": "1751395200000-abc123",
      "type": "MESSAGE",
      "title": "Mensaje de Juan en #general",
      "body": "Hola a todos!",
      "senderId": 42,
      "senderName": "Juan Pérez",
      "channelId": 5,
      "channelName": "general",
      "courseId": 1,
      "link": "/app/courses/1/channels/5",
      "isRead": false,
      "createdAt": "2025-05-31T12:00:00.000Z"
    }
  }'
```

## Estructura de Datos

### Redis Keys

```
notifications:unread:{userId}  → STRING (contador integer)
notifications:user:{userId}   → LIST (máximo 100 items)
notification:ts:{id}          → STRING (timestamp para TTL)
```

### Formato de Notificación

```json
{
  "id": "1751395200000-abc123",
  "type": "MESSAGE",
  "title": "Mensaje de Juan Pérez en #general",
  "body": "Hola a todos!",
  "senderId": 42,
  "senderName": "Juan Pérez",
  "channelId": 5,
  "channelName": "general",
  "courseId": 1,
  "link": "/app/courses/1/channels/5",
  "isRead": false,
  "createdAt": "2025-05-31T12:00:00.000Z"
}
```

## Scripts

```bash
npm run start:dev    # Desarrollo con watch
npm run start:prod   # Producción
npm run build        # Compilar TypeScript
npm run lint         # Linting
npm run test         # Tests
```

## Docker

```bash
# Construir imagen
docker build -t acadia-redis .

# Ejecutar contenedor
docker run -p 4001:4001 --env-file .env acadia-redis

# Con docker-compose (recomendado)
docker-compose up -d
```

## Integración con Frontend

```typescript
import { io, Socket } from 'socket.io-client';

const socket: Socket = io('http://localhost:4001/notifications', {
  auth: { token: 'your-jwt-token' }
});

socket.on('notification:created', (notification) => {
  console.log('Nueva notificación:', notification);
  // Mostrar toast, actualizar badge, etc.
});
```

## Licencia

UNLICENSED
