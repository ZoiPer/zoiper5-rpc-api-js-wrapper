const MAX_LIST_HISTORY_CALLS = 10;
const MAX_LIST_CONTACTS = 10;

class Application {
  constructor() {
    this.toggleConnectionButton = document.getElementById('toggle-connection');
    this.clearLogButton = document.getElementById('clear-log');
    this.dialButton = document.getElementById('dial');
    this.endActiveCallButton = document.getElementById('end-active-call');
    this.acceptIncomingCallButton = document.getElementById('accept-incoming-call');
    this.rejectIncomingCallButton = document.getElementById('reject-incoming-call');
    this.filterContactsButton = document.getElementById('filter-contacts');
    this.listContactsButton = document.getElementById('list-contacts');
    this.listHistoryCallsButton = document.getElementById('list-history-calls');
    this.enableCallRecordingCheckbox = document.getElementById('enable-call-recording');
    this.saveOptionsButton = document.getElementById('save-options');
    this.phoneNumberInput = document.getElementById('phone-number');
    this.contactFilterInput = document.getElementById('contact-filter');
    this.logTextarea = document.getElementById('log');
    this.connectedActions = document.getElementById('connected-actions');

    this.toggleConnectionButton.addEventListener('click', this.toggleConnection.bind(this));
    this.clearLogButton.addEventListener('click', this.clearLog.bind(this));
    this.dialButton.addEventListener('click', this.dial.bind(this));
    this.endActiveCallButton.addEventListener('click', this.endActiveCall.bind(this));
    this.acceptIncomingCallButton.addEventListener('click', this.acceptFirstIncomingCall.bind(this));
    this.rejectIncomingCallButton.addEventListener('click', this.rejectFirstIncomingCall.bind(this));
    this.filterContactsButton.addEventListener('click', this.filterContacts.bind(this));
    this.listContactsButton.addEventListener('click', this.listContacts.bind(this));
    this.listHistoryCallsButton.addEventListener('click', this.filterHistoryCalls.bind(this));
    this.enableCallRecordingCheckbox.addEventListener('click', this.toggleCallRecording.bind(this));
    this.saveOptionsButton.addEventListener('click', this.saveOptions.bind(this));

    this.resetState();
  }

  resetState() {
    delete this.rpcManager;
    delete this.connectionManager;
    delete this.zoiperAPI;

    this.historyFilterSet = new Set();
  }

  logMessage(message) {
    const scrollLocation = this.logTextarea.scrollHeight - this.logTextarea.scrollTop;
    const scrollToBottom = scrollLocation === this.logTextarea.clientHeight;
    const date = new Date();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const milliseconds = date.getMilliseconds().toString().padEnd(3, '0');

    this.logTextarea.innerHTML += `${hours}:${minutes}:${seconds}.${milliseconds} - ${message}\n`;

    if (scrollToBottom) {
      this.logTextarea.scrollTop = this.logTextarea.scrollHeight;
    }
  }

  clearLog() {
    this.logTextarea.innerHTML = '';
  }

  onConnectionOpen() {
    this.showConnectedActions();
    this.displayDefaultAccountInformation();
    this.updateCallRecordingCheckboxState();
  }

  onConnectionClose() {
    this.logMessage('Connection closed');

    this.hideConnectedActions();
    this.resetState();
  }

  async connect() {
    try {
      this.rpcManager = new Z5RPC.RPCManager({
        'phone': this.phoneEventCallback.bind(this),
        'call': this.callStateCallback.bind(this),
        'contact-service': this.contactServiceCallback.bind(this),
        'history-filter': this.historyFilterStateCallback.bind(this),
      });
      this.connectionManager = new Z5RPC.ConnectionManager(this.rpcManager, {
        url: 'ws://127.0.0.1:25000/',
      });
      this.connectionManager.onClose = this.onConnectionClose.bind(this);

      this.logMessage('Connecting to server...');

      await this.connectionManager.openConnection();
      this.zoiperAPI = await this.rpcManager.initialize(API_TOKEN);

      this.logMessage('Connected to server');

      this.onConnectionOpen();
    } catch (ex) {
      this.logMessage(`Connection failure: ${ex instanceof Error ? ex.toString() : JSON.stringify(ex)}`);
    }
  }

  disconnect() {
    this.logMessage('Closing connection...');

    this.connectionManager.closeConnection();
  }

  toggleConnection() {
    if (this.connectionManager) {
      this.disconnect();
    } else {
      this.connect();
    }
  }

  async phoneEventCallback(event, stringParam, longParam, boolParam, resultParam, errorParam) {
    switch (event) {
      case 'options_save':
        if (boolParam) {
          this.logMessage(`Options failed to save (error: "${stringParam}")`);
        } else {
          this.logMessage('Options saved');
        }
        break;
      case 'win_activated':
        this.logMessage('Main window activated');
        break;
    }
  }

  async callStateCallback(call, state, error) {
    const phoneNumber = call ? `"${await call.phone}"` : 'nobody';

    switch (state) {
      case 'incoming':
        this.logMessage(`Incoming call from ${phoneNumber}`);
        break;
      case 'outgoing':
        this.logMessage(`Outgoing call to ${phoneNumber}`);
        break;
      case 'hangup':
        this.logMessage(`Call ended with ${phoneNumber}, duration: ${await call.durationText}`);
        break;
      case 'accepted':
        this.logMessage(`Call with ${phoneNumber} was accepted`);
        break;
      case 'active_call':
        this.logMessage(`Changed active call, now talking with ${phoneNumber}`);
        break;
      case 'recording_started':
        this.logMessage(`Started recording call with ${phoneNumber} in file: ${await call.recordingFilename}`);
        break;
      case 'recording_stopped':
        this.logMessage(`Stopped recording call with ${phoneNumber} in file: ${await call.recordingFilename}`);
        break;
      case 'replaced_contact': {
        const contact = await call.contact;
        const contactName = await contact.name;

        if (!await contact.hidden) {
          this.logMessage(`Matched contact for call with ${phoneNumber}, contact name: "${contactName}"`);
        }

        break;
      }
    }
  }

  async contactServiceCallback(contactService, state) {
    switch (state) {
      case 'search_completed':
        this.logMessage(`Search completed for contact service: ${await contactService.name}`);
        break;
    }
  }

  async historyFilterStateCallback(historyFilter, historyDetail, state) {
    const historyFilterIdent = await historyFilter.ident;

    if (!this.historyFilterSet.has(historyFilterIdent)) return;

    switch (state) {
      case 'search_started':
        this.logMessage(`Search started for history filter: ${historyFilterIdent}`);
        break;
      case 'search_completed':
        this.logMessage(`Search completed for history filter: ${historyFilterIdent}`);

        this.listHistoryCalls(historyFilter);
        break;
    }
  }

  showConnectedActions() {
    this.connectedActions.classList.remove('hidden');
  }

  hideConnectedActions() {
    this.connectedActions.classList.add('hidden');
  }

  async displayDefaultAccountInformation() {
    const accountList = await this.zoiperAPI.accounts;
    const defaultAccount = await accountList.defaultAccount;

    if (defaultAccount) {
      this.logMessage(`Default account: ${await defaultAccount.name}`);
    } else {
      this.logMessage(`WARNING: No default account is set, dialing will most probably fail`);
    }
  }

  async updateCallRecordingCheckboxState() {
    const optionsGeneral = await this.zoiperAPI.optionsGeneral;
    const enableCallRecording = await optionsGeneral.recordCalls;

    this.enableCallRecordingCheckbox.checked = enableCallRecording;
  }

  async dial() {
    const phoneNumber = this.phoneNumberInput.value;
    const constants = await this.zoiperAPI.constants;
    await this.zoiperAPI.createCall(phoneNumber, false, '', async (result, call) => {
      if (result === await constants.EAPI_ERROR_OK) {
        this.logMessage(`Created a call with "${await call.phone}"`);
      } else {
        this.logMessage(`Failed to create a call (result: "${call})"`);
      }
    });
  }

  async endActiveCall() {
    const activeCall = await this.zoiperAPI.activeCall;

    if (activeCall) {
      activeCall.hangup();
    } else {
      this.logMessage('Currently there is no active call');
    }
  }

  async firstIncomingCallAction(actionCallback) {
    const callList = await this.zoiperAPI.calls;
    const callCount = await callList.count;

    for (let i = 0; i < callCount; i += 1) {
      await callList.itemAt(i, async (result, call) => {
        if (await call.isIncoming && await call.isRinging) {
          await actionCallback(call);
        }
      });
    }

    this.logMessage('Currently there are no incoming calls');
  }

  acceptFirstIncomingCall() {
    this.firstIncomingCallAction(call => call.accept(false));
  }

  rejectFirstIncomingCall() {
    this.firstIncomingCallAction(call => call.hangup());
  }

  async filterContacts() {
    const constants = await this.zoiperAPI.constants;
    const contactList = await this.zoiperAPI.contacts;
    const result = await contactList.filter(
      this.contactFilterInput.value,
      await constants.ECONTACTS_SORT_NAME,
      await constants.ECONTACT_TYPE_UNKNOWN,
      false,
    );

    if (result === await constants.EAPI_ERROR_OK) {
      this.logMessage('Contact search started');
    } else {
      this.logMessage('Contact search did not start, most probably the filter did not change');
    }
  }

  async listContacts() {
    const contactList = await this.zoiperAPI.contacts;
    const contactCount = await contactList.count;
    const listCount = Math.min(contactCount, MAX_LIST_CONTACTS);

    this.logMessage(`Listing ${listCount} out of ${contactCount} contact(s):`);
    this.logMessage('-'.repeat(30));

    for (let i = 0; i < listCount; i += 1) {
      await contactList.itemAt(i, async (result, contact) => {
        const contactName = await contact.name;
        const contactPhoneList = await contact.phones;
        const contactPhoneCount = await contactPhoneList.count;

        this.logMessage(`Contact "${contactName}" has ${contactPhoneCount} phone number(s)`);
      });
    }

    this.logMessage('-'.repeat(30));
  }

  async listHistoryCalls(historyFilter) {
    const constants = await this.zoiperAPI.constants;
    const historyService = await this.zoiperAPI.historyService;
    const historyFilterIdent = await historyFilter.ident;
    const historyList = await historyFilter.histories;
    const historyDetailCount = await historyList.count;

    this.logMessage(`Found ${historyDetailCount} history call(s):`);
    this.logMessage('-'.repeat(30));

    for (let i = 0; i < historyDetailCount; i += 1) {
      await historyList.itemAt(i, async (result, historyDetail) => {
        const datetime = await historyDetail.datetime;
        const callSummary = await historyDetail.callSummary;
        const peerNumber = await callSummary.peerNumber;
        const established = await callSummary.established;
        const terminationOrigin = await callSummary.terminationOrigin;
        let callOutcome;

        switch (await callSummary.origin) {
          case await constants.EORIGIN_LOCAL:
            if (established) {
              callOutcome = 'Call to ?, answered.';
            } else {
              if (terminationOrigin === await constants.EORIGIN_LOCAL) {
                callOutcome = 'Call to ?, no answer.';
              } else if (terminationOrigin === await constants.EORIGIN_REMOTE) {
                callOutcome = 'Call to ?, rejected.';
              } else if (terminationOrigin === await constants.EORIGIN_FAILURE) {
                callOutcome = 'Call to ?, failed.';
              } else {
                callOutcome = 'Call to ?.';
              }
            }
            break;
          case await constants.EORIGIN_REMOTE:
            if (established) {
              callOutcome = 'Call from ?, answered.';
            } else {
              if (terminationOrigin === await constants.EORIGIN_LOCAL) {
                callOutcome = 'Call from ?, rejected.';
              } else if (terminationOrigin === await constants.EORIGIN_REMOTE) {
                callOutcome = 'Missed call from ?.';
              } else if (terminationOrigin === await constants.EORIGIN_FAILURE) {
                callOutcome = 'Call from ?, failed.';
              } else {
                callOutcome = 'Call from ?.';
              }
            }
            break;
          default:
            callOutcome = 'Call with ?.';
        }

        const terminationError = await callSummary.terminationError;
        let callError = '';

        if (await terminationError.isError) {
          callError = ` Error: ${await terminationError.text} (code: ${await terminationError.layerCode})`;
        }

        this.logMessage(`[${datetime}] ${callOutcome.replace('?', peerNumber)}${callError}`);
      });
    }

    this.logMessage('-'.repeat(30));

    await historyService.removeFilter(historyFilter);

    this.historyFilterSet.delete(historyFilterIdent);

    this.logMessage(`Removed history filter: ${historyFilterIdent}`);
  }

  async filterHistoryCalls() {
    const constants = await this.zoiperAPI.constants;
    const historyService = await this.zoiperAPI.historyService;
    await historyService.addFilter(async (result, historyFilter) => {
      if (result === await constants.EAPI_ERROR_OK) {
        const historyFilterIdent = await historyFilter.ident;

        this.logMessage(`Added history filter: ${historyFilterIdent}`);

        await historyFilter.addType(await constants.EHISTORY_TYPE_CALL);
        await historyFilter.apply(await constants.EHISTORY_GROUP_MODE_EVENT, MAX_LIST_HISTORY_CALLS);

        this.historyFilterSet.add(historyFilterIdent);
      } else {
        this.logMessage(`Failed to add history filter: ${result}`);
      }
    });
  }

  async toggleCallRecording() {
    const optionsGeneral = await this.zoiperAPI.optionsGeneral;
    const enableCallRecording = this.enableCallRecordingCheckbox.checked;

    if (enableCallRecording) {
      this.logMessage('Enabling call recording for all calls');
    } else {
      this.logMessage('Disabling call recording for all calls');
    }

    optionsGeneral.recordCalls = enableCallRecording;
    await optionsGeneral.apply();
  }

  async saveOptions() {
    this.logMessage('Saving options...');

    await this.zoiperAPI.saveOptions();
  }
}

window.application = new Application();
