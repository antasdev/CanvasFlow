# 09. API Documentation

## Overview

CanvasFlow exposes a RESTful API built with **Node.js**, **Express**, and **TypeScript**.

The API is responsible for:

- Authentication
- Board Management
- Collaboration
- Canvas Operations
- Comments
- Version History
- Notifications
- File Uploads

The API follows REST principles and uses JWT authentication.

---

# Base URL

Development

```
http://localhost:5000/api/v1
```

Production

```
https://api.canvasflow.com/api/v1
```

---

# Authentication

Protected routes require:

```
Authorization: Bearer <access_token>
```

---

# Response Format

Success

```json
{
    "success": true,
    "message": "Board created successfully",
    "data": {}
}
```

Error

```json
{
    "success": false,
    "message": "Unauthorized",
    "errors": []
}
```

---

# Authentication API

## Register

POST

```
/auth/register
```

Body

```json
{
    "name": "",
    "email": "",
    "password": ""
}
```

---

## Login

POST

```
/auth/login
```

---

## Logout

POST

```
/auth/logout
```

---

## Refresh Token

POST

```
/auth/refresh-token
```

---

## Verify Email

GET

```
/auth/verify/:token
```

---

## Forgot Password

POST

```
/auth/forgot-password
```

---

## Reset Password

POST

```
/auth/reset-password
```

---

# User API

## Get Profile

GET

```
/users/profile
```

---

## Update Profile

PATCH

```
/users/profile
```

---

## Upload Avatar

POST

```
/users/avatar
```

---

## Delete Account

DELETE

```
/users/account
```

---

# Board API

## Get Boards

GET

```
/boards
```

---

## Get Single Board

GET

```
/boards/:boardId
```

---

## Create Board

POST

```
/boards
```

---

## Update Board

PATCH

```
/boards/:boardId
```

---

## Delete Board

DELETE

```
/boards/:boardId
```

---

## Duplicate Board

POST

```
/boards/:boardId/duplicate
```

---

## Archive Board

PATCH

```
/boards/:boardId/archive
```

---

## Restore Board

PATCH

```
/boards/:boardId/restore
```

---

## Favorite Board

PATCH

```
/boards/:boardId/favorite
```

---

# Collaboration API

## Invite Member

POST

```
/boards/:boardId/invite
```

---

## Remove Member

DELETE

```
/boards/:boardId/members/:userId
```

---

## Update Member Role

PATCH

```
/boards/:boardId/members/:userId
```

---

## List Members

GET

```
/boards/:boardId/members
```

---

# Canvas API

## Get Canvas Objects

GET

```
/boards/:boardId/objects
```

---

## Create Object

POST

```
/boards/:boardId/objects
```

---

## Update Object

PATCH

```
/boards/:boardId/objects/:objectId
```

---

## Delete Object

DELETE

```
/boards/:boardId/objects/:objectId
```

---

## Bulk Update Objects

PATCH

```
/boards/:boardId/objects
```

---

# Comments API

## Get Comments

GET

```
/boards/:boardId/comments
```

---

## Add Comment

POST

```
/boards/:boardId/comments
```

---

## Reply to Comment

POST

```
/comments/:commentId/replies
```

---

## Resolve Comment

PATCH

```
/comments/:commentId/resolve
```

---

## Delete Comment

DELETE

```
/comments/:commentId
```

---

# Version History API

## Get Versions

GET

```
/boards/:boardId/versions
```

---

## Restore Version

POST

```
/boards/:boardId/versions/:versionId/restore
```

---

# Notification API

## Get Notifications

GET

```
/notifications
```

---

## Mark as Read

PATCH

```
/notifications/:notificationId/read
```

---

## Mark All as Read

PATCH

```
/notifications/read-all
```

---

# File Upload API

## Upload Image

POST

```
/uploads/images
```

---

## Delete Image

DELETE

```
/uploads/images/:imageId
```

---

# Health Check

GET

```
/health
```

Returns server status.

---

# HTTP Status Codes

| Code | Meaning |
|------|----------|
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 422 | Validation Error |
| 500 | Internal Server Error |

---

# Validation

All requests are validated using **Zod**.

Validation includes:

- Required fields
- Email format
- Password strength
- ObjectId validation
- File validation

---

# Authentication

JWT Access Token

Refresh Token

HttpOnly Cookies

Role Based Access Control

---

# Rate Limiting

Authentication APIs

```
5 requests/minute
```

General APIs

```
100 requests/minute
```

---

# Versioning

Current API Version

```
v1
```

Example

```
/api/v1/boards
```

---

# Future APIs

- Templates
- Teams
- Organizations
- AI Assistant
- Analytics
- Search
- Export (PDF, PNG, SVG)
- Webhooks