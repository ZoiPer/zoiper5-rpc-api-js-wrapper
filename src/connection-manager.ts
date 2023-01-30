import type {RPCManager} from './rpc-manager';

export interface ConnectionManagerOptions {
  url: string;
}

export class ConnectionManager {
  private _rpcManager: RPCManager;
  private _options: ConnectionManagerOptions;
  private _socket?: WebSocket | undefined;

  constructor(rpcManager: RPCManager, options: ConnectionManagerOptions) {
    this._rpcManager = rpcManager;
    this._options = options;
  }

  onClose?(event: CloseEvent): void;

  openConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._socket = new WebSocket(this._options.url, 'text');

      this._socket.onmessage = (event) => {
        this._rpcManager.processMessage(event.data);
      };

      this._rpcManager.sendMessage = (message) => {
        this._socket!.send(message);
      };

      this._socket.onclose = (event) => {
        this.onClose?.(event);
      };
      this._socket.onopen = () => resolve();
      this._socket.onerror = reject;
    });
  }

  closeConnection(): void {
    this._socket?.close();
  }
}
