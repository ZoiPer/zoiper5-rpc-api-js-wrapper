async function runExample() {
  try {
    const rpcManager = new Z5RPC.RPCManager({});
    const connectionManager = new Z5RPC.ConnectionManager(rpcManager, {
      url: 'ws://127.0.0.1:25000/',
    });

    await connectionManager.openConnection();

    const zoiperAPI = await rpcManager.initialize(API_TOKEN);
    const applicationVersion = await zoiperAPI.versionPhone;

    document.body.textContent = `application version: ${applicationVersion}`;

    connectionManager.closeConnection();
  } catch (ex) {
    document.body.textContent = `error: ${ex}`;
  }
}

runExample();
