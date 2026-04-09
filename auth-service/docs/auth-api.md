# HealthLink Auth Service API

## Base URL
`/api/auth`

## Authentication Model
- Access token: short-lived JWT (default 15 minutes)
- Refresh token: longer-lived JWT (default 7 days)
- Access token must be sent as `Authorization: Bearer <token>`
- Refresh token is rotated on each successful refresh
- Logout revokes all sessions by clearing stored refresh token hash

## Roles
- `patient`
- `Doctor`
- `Admin`

## Endpoints

### 1) Login
**POST** `/api/auth/login`

Request body:
```json
{
  "identifier": "user_email_or_username",
  "password": "plainPassword"
}
```

Success response (200):
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "663...",
      "username": "john",
      "email": "john@example.com",
      "role": "patient",
      "isActive": true
    },
    "accessToken": "jwt_access_token",
    "refreshToken": "jwt_refresh_token"
  }
}
```

Error responses:
- `401` Invalid credentials
- `403` Account is inactive
- `400` Validation failed

### 2) Logout
**POST** `/api/auth/logout`

Headers:
`Authorization: Bearer <access_token>`

Success response (200):
```json
{
  "success": true,
  "message": "Logout successful"
}
```

### 3) Me
**GET** `/api/auth/me`

Headers:
`Authorization: Bearer <access_token>`

Success response (200):
```json
{
  "success": true,
  "message": "Current user fetched successfully",
  "data": {
    "id": "663...",
    "username": "john",
    "email": "john@example.com",
    "role": "patient",
    "isActive": true
  }
}
```

### 4) Refresh Token
**POST** `/api/auth/refresh`

Request body:
```json
{
  "refreshToken": "jwt_refresh_token"
}
```

Success response (200):
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "user": {
      "id": "663...",
      "username": "john",
      "email": "john@example.com",
      "role": "patient",
      "isActive": true
    },
    "accessToken": "new_access_token",
    "refreshToken": "new_refresh_token"
  }
}
```

Error responses:
- `401` Invalid or expired refresh token
- `400` Validation failed

### 5) Validate Access Token
**GET** `/api/auth/validate-token`

Headers:
`Authorization: Bearer <access_token>`

Success response (200):
```json
{
  "success": true,
  "message": "Access token is valid",
  "data": {
    "userId": "663...",
    "role": "patient"
  }
}
```

## Role-Protected Example Routes
- **GET** `/api/auth/patient-only` -> patient only
- **GET** `/api/auth/doctor-only` -> Doctor only
- **GET** `/api/auth/admin-only` -> Admin only

## Login Flow
1. Client sends identifier + password to login endpoint.
2. Service verifies account by email or username.
3. Service checks account is active.
4. Service compares password with bcrypt hash.
5. On success, service issues access + refresh tokens.
6. Service stores hashed refresh token in user record.
7. Client uses access token for protected APIs.
8. When access token expires, client calls refresh endpoint.
9. Service validates refresh token, rotates and returns new tokens.
10. On logout, refresh token hash is removed to revoke sessions.
