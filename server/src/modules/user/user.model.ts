import { Schema, model, models } from "mongoose";

import {
    AuthProvider,
    UserRole,
    UserStatus,
} from "./user.types";

//Profile Schema

const profileSchema = new Schema(
    {
        avatar: {
            type: String,
            default: "",
        },
        bio: {
            type: String,
            default: "",
            maxlength: 200,
        },
        timezone: {
            type: String,
            default: "UTC",
        },
        language: {
            type: String,
            default: "en",
        },
    },
    {
        _id: false,
    }
);


//Preferences Schema

const preferencesSchema = new Schema(
    {
        theme: {
            type: String,
            enum: ["light", "dark", "system"],
            default: "system",
        },
        notificationsEnabled: {
            type: Boolean,
            default: true,
        },
        onboardingCompleted: {
            type: Boolean,
            default: false,
        },
    },
    {
        _id: false,
    }
);

//Security Schema

const securitySchema = new Schema(
    {
        failedLoginAttempts: {
            type: Number,
            default: 0,
        },

        lockUntil: {
            type: Date,
        },

        passwordChangedAt: {
            type: Date,
        },

        lastLogin: {
            type: Date,
        },

        refreshTokenVersion: {
            type: Number,
            default: 0,
        },
    },
    {
        _id: false,
    }
);

//Main User Schema

const userSchema = new Schema(
    {
        fullName: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 100,
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, "Invalid email address"],
        },

        password: {
            type: String,
            required: true,
            minlength: 8,
        },

        role: {
            type: String,
            enum: Object.values(UserRole),
            default: UserRole.USER,
        },

        provider: {
            type: String,
            enum: Object.values(AuthProvider),
            default: AuthProvider.LOCAL,
        },

        status: {
            type: String,
            enum: Object.values(UserStatus),
            default: UserStatus.PENDING_VERIFICATION,
        },

        emailVerified: {
            type: Boolean,
            default: false,
        },

        profile: {
            type: profileSchema,
            default: () => ({}),
        },

        preferences: {
            type: preferencesSchema,
            default: () => ({}),
        },

        security: {
            type: securitySchema,
            default: () => ({}),
        },
    },
    {
        timestamps: true,
        collection: "users",
    }
);

userSchema.index({ role: 1 });

userSchema.index({ status: 1 });



const MODEL_NAME = "User";

export const UserModel =
    models[MODEL_NAME] || model(MODEL_NAME, userSchema);