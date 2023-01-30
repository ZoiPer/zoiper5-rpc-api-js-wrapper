declare module 'simple-jsonrpc-js' {
  interface simple_jsonrpc {
    toStream(message: string): void;
    on(functionName: string, paramsNameFn: Function): void;
    on(functionName: string, paramsNameFn: string[], fn: Function): void;
    off(functionName: string): void;
    call(method: string, params?: any): Promise<any>;
    notification(method: string, params?: any): void;
    messageHandler(rawMessage: string): Promise<any>;
  }

  const simple_jsonrpc: {
    new(): simple_jsonrpc;
  };

  export default simple_jsonrpc;
}
