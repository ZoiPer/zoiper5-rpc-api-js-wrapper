import simple_jsonrpc from 'simple-jsonrpc-js';
import {
  API_CLIENT_METHOD_CALLBACK,
} from './const/rpc-client-methods';
import {
  API_SERVER_METHOD_AUTHENTICATE,
  API_SERVER_METHOD_GET_ROOT_OBJECT,
  API_SERVER_METHOD_GET_VALUE,
  API_SERVER_METHOD_SET_VALUE,
  API_SERVER_METHOD_CALL_FUNCTION,
  API_SERVER_METHOD_DESCRIBE_VARIABLES,
  API_SERVER_METHOD_DESCRIBE_FUNCTIONS,
} from './const/rpc-server-methods';
import {
  API_VALUE_TYPE_EMPTY,
  API_VALUE_TYPE_SCRIPT_OBJECT,
  API_VALUE_INVALID_SCRIPT_OBJECT,
} from './const/rpc-values';

type SerializedEmptyScriptObject = {type: typeof API_VALUE_TYPE_EMPTY};
type SerializedScriptObject = {type: typeof API_VALUE_TYPE_SCRIPT_OBJECT, scriptObject: number};
type SerializedValue = boolean | number | string | SerializedEmptyScriptObject | SerializedScriptObject;
type SerializableObject = object;
type SerializableValue = boolean | number | string | SerializableObject | undefined | null;

function isPlainValueType(value: unknown): value is boolean | number | string {
  return ['boolean', 'number', 'string'].includes(typeof value);
}

/**
 * Manages the communication between the client and the Zoiper5 RPC API server.
 */
export class RPCManager<T extends SerializableObject = any> {
  private _lastScriptObjectId: number;
  private _scriptObjectIdMap: WeakMap<SerializableObject, number>;
  private _globalCallbacksMap: Record<string, Function>;
  private _scriptObjectListStack: SerializableObject[][];
  private _jrpc: simple_jsonrpc;

  /**
   * Creates and configures a {@link RPCManager} instance that needs to be initialized via {@link initialize()}.
   */
  constructor(globalCallbacksMap: Record<string, Function>) {
    this._lastScriptObjectId = API_VALUE_INVALID_SCRIPT_OBJECT;
    this._scriptObjectIdMap = new WeakMap();

    const globalCallbackFunctions = Object.values(globalCallbacksMap);

    globalCallbackFunctions.forEach((fn) => this._assignScriptObjectId(fn));

    this._globalCallbacksMap = globalCallbacksMap;
    this._scriptObjectListStack = [globalCallbackFunctions];
    this._jrpc = new simple_jsonrpc();

    this._jrpc.toStream = (message: string) => {
      this.sendMessage(message);
    };

    this._jrpc.on(API_CLIENT_METHOD_CALLBACK, (serializedTarget: SerializedScriptObject, ...serializedArgs: SerializedValue[]) => {
      return this._handleAPICallback(serializedTarget.scriptObject, serializedArgs);
    });
  }

  /**
   * Registers the provided callback list via the {@link RPCManager:constructor()},
   * and starts managing the client-server communication.
   * @param token An API token obtained in advance.
   * @returns An instance of the Zoiper5 API root object - an instance of class `Phone`.
   */
  async initialize(token: string): Promise<T> {
    await this._jrpc.call(API_SERVER_METHOD_AUTHENTICATE, [token]);
    const response = await this._jrpc.call(API_SERVER_METHOD_GET_ROOT_OBJECT);
    const apiRootObject = await this._deserialize(response);

    for (const [name, fn] of Object.entries(this._globalCallbacksMap)) {
      await (apiRootObject as {registerCallback(name: string, fn: Function): Promise<void>}).registerCallback(name, fn);
    }

    return apiRootObject as T;
  }

  /**
   * Send a message from the server to the manager for proccessing.
   * @param message The message that gets sent to the manager.
   */
  processMessage(message: string): Promise<any> {
    return this._jrpc.messageHandler(message);
  }

  /**
   * Overridable method that the manager uses for sending messages to the server.
   * @virtual
   * @param message The message that gets sent to the server.
   */
  sendMessage(message: string): void;
  sendMessage() {
    throw new Error('Method "sendMessage" is not implemented');
  }

  private _assignScriptObjectId(object: SerializableObject): void {
    if (!this._scriptObjectIdMap.has(object)) {
      this._lastScriptObjectId += 1;
      this._scriptObjectIdMap.set(object, this._lastScriptObjectId);
    }
  }

  private _createGetter(serializedTarget: SerializedScriptObject, propertyName: string): () => Promise<SerializableValue> {
    return async () => {
      const response = await this._jrpc.call(API_SERVER_METHOD_GET_VALUE, [
        serializedTarget,
        propertyName,
      ]);

      return this._deserialize(response);
    };
  }

  private _createSetter(serializedTarget: SerializedScriptObject, propertyName: string): (value: SerializableValue) => Promise<void> {
    return async (value) => {
      await this._jrpc.call(API_SERVER_METHOD_SET_VALUE, [
        serializedTarget,
        propertyName,
        this._serialize(value),
      ]);
    };
  }

  private _createMethod(serializedTarget: SerializedScriptObject, methodName: string): (...args: SerializableValue[]) => Promise<SerializableValue> {
    return (...args: SerializableValue[]) => {
      return this._callAPIMethod(serializedTarget, methodName, args);
    };
  }

  private _findScriptObject(scriptObjectId: number): SerializableObject | undefined {
    for (const scriptObjectList of this._scriptObjectListStack) {
      for (const scriptObject of scriptObjectList) {
        if (this._scriptObjectIdMap.get(scriptObject) === scriptObjectId) {
          return scriptObject;
        }
      }
    }
  }

  private async _callAPIMethod(serializedTarget: SerializedScriptObject, methodName: string, args: SerializableValue[]): Promise<SerializableValue> {
    const scriptObjectList = args.filter((arg) => arg instanceof Object) as SerializableObject[];

    scriptObjectList.forEach((obj) => this._assignScriptObjectId(obj));
    this._scriptObjectListStack.unshift(scriptObjectList);

    try {
      const response = await this._jrpc.call(API_SERVER_METHOD_CALL_FUNCTION, [
        serializedTarget,
        methodName,
        ...args.map((arg) => this._serialize(arg)),
      ]);

      return await this._deserialize(response);
    } finally {
      this._scriptObjectListStack.shift();
    }
  }

  private async _handleAPICallback(functionId: number, args: SerializedValue[]): Promise<void> {
    const callbackFunction = this._findScriptObject(functionId);

    if (typeof callbackFunction !== 'function') {
      throw new Error(`Function was not found - ID: ${functionId}`);
    }

    const functionArguments = await Promise.all(args.map((arg) => this._deserialize(arg)));

    await callbackFunction.apply(null, functionArguments);
  }

  private async _describeScriptObject(serializedTarget: SerializedScriptObject): Promise<SerializableObject> {
    const scriptObject = {};
    const properties = await this._jrpc.call(API_SERVER_METHOD_DESCRIBE_VARIABLES, [serializedTarget]);
    const methods = await this._jrpc.call(API_SERVER_METHOD_DESCRIBE_FUNCTIONS, [serializedTarget]);

    this._scriptObjectIdMap.set(scriptObject, serializedTarget.scriptObject);

    for (const property of properties) {
      Object.defineProperty(scriptObject, property, {
        enumerable: true,
        get: this._createGetter(serializedTarget, property),
        set: this._createSetter(serializedTarget, property),
      });
    }

    for (const method of methods) {
      Object.defineProperty(scriptObject, method, {
        enumerable: true,
        value: this._createMethod(serializedTarget, method),
      });
    }

    return Object.seal(scriptObject);
  }

  private _serialize(value: SerializableObject): SerializedScriptObject;
  private _serialize(value: SerializableValue): SerializedValue;
  private _serialize(value: unknown): unknown {
    if (isPlainValueType(value)) {
      return value;
    }

    if (value === undefined) {
      return {type: API_VALUE_TYPE_EMPTY};
    }

    let scriptObjectId;

    if (value === null) {
      scriptObjectId = API_VALUE_INVALID_SCRIPT_OBJECT;
    } else {
      scriptObjectId = this._scriptObjectIdMap.get(value);
    }

    if (scriptObjectId === undefined) {
      throw new Error(`Unexpected value: ${value}`);
    }

    return {type: API_VALUE_TYPE_SCRIPT_OBJECT, scriptObject: scriptObjectId};
  }

  private async _deserialize(value: SerializedValue): Promise<SerializableValue> {
    if (isPlainValueType(value)) {
      return value;
    }

    if (typeof value === 'object' && value !== null) {
      if (value.type === API_VALUE_TYPE_EMPTY) {
        return undefined;
      }

      if (value.type === API_VALUE_TYPE_SCRIPT_OBJECT) {
        return value.scriptObject === API_VALUE_INVALID_SCRIPT_OBJECT ? null : this._describeScriptObject(value);
      }
    }

    throw new Error(`Unexpected value: ${value}`);
  }
}
