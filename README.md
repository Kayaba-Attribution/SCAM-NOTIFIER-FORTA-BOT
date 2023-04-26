# SCAM NOTIFIER BOT

## Description

This bot monitors notification EOAs and emit an alert on the scam contract/EOA associated with the to address the scam notifier sends messages to and automatically updates the list of notification EOAs by performing an analysis based on other notifications.

1. Checks transcations Input Data to see if there is a valid message
2. If so the from, to, hash, recipientAddressType, and text is saved in a Neo4j db.
3. Starts with some notifier address, but can be expanded to multiple
4. If the message is found, and was sent from the notifier address, it will create an alert

- If the message was sent to an EOA, it will create the alert SCAM-NOTIFIER-EOA
- If the message was sent to an Contract, it will create the alert SCAM-NOTIFIER-CONTRACT

4. The bot has logic to add new new notifier addresses:

- Checks if the sender address have any reports in common with known notifiers
- If the amount of shared reports is >= 2 the address is upgraded to notifier
- If a new notifier is added, it will create the alert NEW-SCAM-NOTIFIER

### New Address addition

+ Only save messages that are sended to an address that has previously flagged by a notifier
  + Check if msg Recipient exist in the db
  + If yes save the sender, tx, and connect
+ When an regular address have at least 2 Transactions, promote it to Notifier

## Supported Chains

- Ethereum

## Alerts

Describe each of the type of alerts fired by this agent

- SCAM-NOTIFIER-EOA

  - Description: “{scammer_eoa} was flagged as a scam by {notifier_eoa} {notifier_name}”
  - Severity is always set to "high"
  - Type is always set to "suspicious"
  - Metadata
    - `scammer_eoa` - the address of the scammer EOA
    - `scammer_contracts` - [to be implemented [PERFORMANCE ISSUES]](https://docs.alchemy.com/docs/how-to-get-all-the-contracts-deployed-by-a-wallet)
    - `notifier_eoa` - the address of the notifier
    - `notifier_name` - a human readable name/ ENS name of the notifier

- SCAM-NOTIFIER-CONTRACT

  - Description: “{scammer_contract} was flagged as a scam by {notifier_eoa} {notifier_name}”
  - Severity is always set to "high"
  - Type is always set to "suspicious"
  - Metadata
    - `scammer_contract` - the scammer contract
    - `scammer_eoa` - the address of the deployer EOA
    - `notifier_eoa` - the address of the notifier
    - `notifier_name` - a human readable name/ ENS name of the notifier

- NEW-SCAM-NOTIFIER
  - Description: “New scam notifier identified {notifier_eoa} {notifier_name}”
  - Severity is always set to "info"
  - Type is always set to "info"
  - Metadata
    - ‘similar_notifier_eoa’ - the address of the notifier that it is similar to (as in flags similar contracts/EOAs)
    - ‘similar_notifier_name’ - a human readable name/ ENS name of the notifier that it is similar to (as in flags similar contracts/EOAs)
  - ‘union_flagged’ - comma separated list of addresses both have flagged
  - `notifier_eoa` - the address of the notifier
  - `notifier_name` - a human readable name/ ENS name of the notifier

### Examples

```bash
1 findings for transaction 0x2bf5b6bdb4b68f8361ccba19437614edd7a98bf8f0d8fe8fe21a4f7cbfff1589 {
  "name": "Scam Notifier Alert",
  "description": "0x477aae186ec9a283ad225ba95ee959d15dbadc98 was flagged as a scam by 0xc574962311141cb505c09fd973c4630b8f7c4a81 🔴dev-will-dump-on-you🔴.eth",
  "alertId": "SCAM-NOTIFIER-EOA",
  "protocol": "ethereum",
  "severity": "High",
  "type": "Suspicious",
  "metadata": {
    "scammer_eoa": "0x477aae186ec9a283ad225ba95ee959d15dbadc98",
    "notifier_eoa": "0xc574962311141cb505c09fd973c4630b8f7c4a81",
    "notifier_name": "🔴dev-will-dump-on-you🔴.eth"
  }
}

1 findings for transaction 0x908446adf1cc7dbd99a24394bfb6fe3b36a80f1ce689848ab002d97e010a8259 {
  "name": "Scam Notifier Alert",
  "description": "0x579fa761387558cef6fee6e2548f74403a2cfa45 was flagged as a scam by 0xc574962311141cb505c09fd973c4630b8f7c4a81 🔴dev-will-dump-on-you🔴.eth",
  "alertId": "SCAM-NOTIFIER-CONTRACT",
  "protocol": "ethereum",
  "severity": "High",
  "type": "Suspicious",
  "metadata": {
    "scammer_contract": "0x579fa761387558cef6fee6e2548f74403a2cfa45",
    "scammer_eoa": "0xe01c1c3e575d7263a8674c7b3417200d9f4da7fb",
    "notifier_eoa": "0xc574962311141cb505c09fd973c4630b8f7c4a81",
    "notifier_name": "🔴dev-will-dump-on-you🔴.eth"
  }
}

1 findings for transaction 0xaf2e787686d6d97e1df4bb7fbec59db5480d99199f96f9969fc90512b2a01554 {
  "name": "Scam Notifier Alert",
  "description": "0x145bc8c3ae5f799a07ffc9d4aff93fb7854f6057 was flagged as a scam by 0xcd5496ef9d7fb6657c9f1a4a1753f645994fbfa9 scamwarning.eth",
  "alertId": "SCAM-NOTIFIER-EOA",
  "protocol": "ethereum",
  "severity": "High",
  "type": "Suspicious",
  "metadata": {
    "scammer_eoa": "0x145bc8c3ae5f799a07ffc9d4aff93fb7854f6057",
    "notifier_eoa": "0xcd5496ef9d7fb6657c9f1a4a1753f645994fbfa9",
    "notifier_name": "scamwarning.eth"
  }
}

1 findings for transaction 0x76cd0f4411eae5be0a5722a38a12549aea79c6931b396ce4f5f2318d5a828a26 {
  "name": "Scam Notifier Alert",
  "description": "0xd2f70f611f3322f309a7ad10f02f08e92f41dfa6 was flagged as a scam by 0xba6e11347856c79797af6b2eac93a8145746b4f9 🛑scam-warning🛑.eth",
  "alertId": "SCAM-NOTIFIER-EOA",
  "protocol": "ethereum",
  "severity": "High",
  "type": "Suspicious",
  "metadata": {
    "scammer_eoa": "0xd2f70f611f3322f309a7ad10f02f08e92f41dfa6",
    "notifier_eoa": "0xba6e11347856c79797af6b2eac93a8145746b4f9",
    "notifier_name": "🛑scam-warning🛑.eth"
  }
}
```

## Test Data

Given the challenge of identifying shared reports between known notifiers, a dataset has been created and tested against the database to ensure maximum accuracy. The method employed involved generating 10 reports from a single address and having another EOA create 2 reports that shared the same recipients.

On-Chain Testing was done to verify the ENS names and the address of the deployer EOA

Known Notifiers:

- 0xcd5496ef9d7fb6657c9f1a4a1753f645994fbfa9 (scamwarning.eth)
- 0xba6e11347856c79797af6b2eac93a8145746b4f9 (🛑scam-warning🛑.eth)
- 0xc574962311141cb505c09fd973c4630b8f7c4a81 (🔴dev-will-dump-on-you🔴.eth)
