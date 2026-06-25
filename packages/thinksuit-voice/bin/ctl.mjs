#!/usr/bin/env node

// thinksuit-voice — control CLI for a running voice daemon. Thin client over the
// control socket. This is the durable surface for hotkeys: bind a key in any OS
// hotkey tool to e.g. `thinksuit-voice interrupt`.

import process from 'node:process';
import { status, micOn, micOff, interrupt } from '../src/control/client.js';
import { runTriggerCli, TRIGGER_USAGE } from '../src/wakewords/cli.js';

const USAGE = `Usage: thinksuit-voice <command>

Control (running daemon):
  status      Print the daemon's current status
  mic-on      Re-acquire the mic and resume listening
  mic-off     Release the mic (indicator dark); daemon stays warm
  interrupt   Cancel the in-flight turn and stop any spoken response

Trigger library:
  trigger <subcommand>   Manage wake triggers (run with no subcommand for help)`;

const verb = process.argv[2];

async function main() {
    switch (verb) {
        case 'status':
            console.log(JSON.stringify(await status(), null, 2));
            break;
        case 'mic-on':
            await micOn();
            console.log('mic on');
            break;
        case 'mic-off':
            await micOff();
            console.log('mic off');
            break;
        case 'interrupt': {
            const { interrupted } = await interrupt();
            console.log(interrupted ? 'interrupted' : 'nothing in flight');
            break;
        }
        case 'trigger':
            await runTriggerCli(process.argv.slice(3));
            break;
        case 'trigger-help':
            console.log(TRIGGER_USAGE);
            break;
        default:
            console.error(USAGE);
            process.exit(1);
    }
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
