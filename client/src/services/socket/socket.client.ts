import { io } from "socket.io-client";
import { appConfig } from "@/config";
import { useAuthStore } from "@/store";
import type {
  ConnectionState,
  TypedSocket,
} from "./socket.types";

/**
 * Encapsulated service managing Socket.IO client connections,
 * authentication handshake, and connection state transitions.
 */
export class SocketClientService {
  private socket: TypedSocket | null = null;
  private connectionState: ConnectionState = "disconnected";
  private stateChangeListeners = new Set<(state: ConnectionState) => void>();

  /**
   * Initializes or returns the authenticated Socket.IO connection.
   *
   * @param tokenOverride - Optional access token override (defaults to useAuthStore accessToken)
   * @returns Typed Socket instance
   */
  public connect(tokenOverride?: string): TypedSocket {
    const rawToken = tokenOverride ?? useAuthStore.getState().accessToken;

    if (this.socket?.connected) {
      return this.socket;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.setConnectionState("connecting");

    const token = rawToken
      ? rawToken.startsWith("Bearer ")
        ? rawToken
        : `Bearer ${rawToken}`
      : "";

    this.socket = io(appConfig.socketUrl, {
      auth: {
        token,
      },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      withCredentials: true,
    }) as TypedSocket;

    this.socket.on("connect", () => {
      this.setConnectionState("connected");
    });

    this.socket.on("disconnect", () => {
      this.setConnectionState("disconnected");
    });

    this.socket.on("connect_error", () => {
      this.setConnectionState("error");
    });

    return this.socket;
  }

  /**
   * Closes the active socket connection and resets state.
   */
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.setConnectionState("disconnected");
  }

  /**
   * Updates authentication credentials and reconnects if active.
   *
   * @param token - The new JWT access token
   */
  public updateToken(token: string): void {
    const formattedToken = token.startsWith("Bearer ")
      ? token
      : `Bearer ${token}`;

    if (this.socket) {
      this.socket.auth = {
        token: formattedToken,
      };

      if (this.socket.connected) {
        this.socket.disconnect().connect();
      }
    }
  }

  /**
   * Retrieves the raw Socket instance if initialized.
   */
  public getSocket(): TypedSocket | null {
    return this.socket;
  }

  /**
   * Checks if socket is currently connected.
   */
  public isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  /**
   * Returns current connection state.
   */
  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Subscribes to connection state changes.
   *
   * @param listener - Callback receiving connection state transitions
   * @returns Cleanup unsubscribe function
   */
  public onStateChange(
    listener: (state: ConnectionState) => void
  ): () => void {
    this.stateChangeListeners.add(listener);
    listener(this.connectionState);

    return () => {
      this.stateChangeListeners.delete(listener);
    };
  }

  private setConnectionState(newState: ConnectionState): void {
    if (this.connectionState !== newState) {
      this.connectionState = newState;
      this.stateChangeListeners.forEach((listener) => listener(newState));
    }
  }
}

export const socketClientService = new SocketClientService();
