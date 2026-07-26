# 08. Database Design

## Overview

CanvasFlow uses MongoDB with Mongoose.

The database is designed using references between collections to support
real-time collaboration, scalability, and maintainability.

The complete database schema is documented in Eraser.

## Database Diagram

[View Database Diagram](../diagrams/database-design.eraser)

or

![Database Diagram](../assets/diagrams/database-design.png)

## Collections

- Users
- Boards
- BoardMembers
- CanvasObjects
- Comments
- Versions
- Activities
- Notifications
- Invitations

## Design Principles

- Reference-based relationships
- Indexed frequently queried fields
- Timestamped documents
- Soft delete support (future)
- Optimized for collaboration

## Future Improvements

- Organizations
- Teams
- Templates
- AI History
- Analytics