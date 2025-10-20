/**
 * Create CLI effect handlers - Primitive I/O operations only
 *
 * @param {Object} context - Context
 * @param {Object} context.rl - Readline instance
 * @param {Object} context.controlDock - ControlDock instance
 * @returns {Object} Effect handlers
 */

import chalk from 'chalk';

export function createCliEffects({ rl, controlDock }) {
    return {
        /**
         * Send output to user
         */
        'output': async (session, message) => {
            controlDock.write(message + '\n');
        },

        /**
         * Handle errors
         */
        'error': async (session, message) => {
            controlDock.write(chalk.red('Error: ' + message) + '\n');
        },

        /**
         * Clear the screen
         */
        'clear': async (session) => {
            console.clear();
        },

        /**
         * Show status line
         */
        'status-show': async (session, message) => {
            controlDock.updateStatus(message);
        },

        /**
         * Clear status line
         */
        'status-clear': async (session) => {
            controlDock.clearStatus();
        },

        /**
         * Clear the dock rendering
         */
        'clear-dock': async (session) => {
            controlDock.clearDock();
        },

        /**
         * Confirm yes/no prompt
         */
        'confirm': async (session, message) => {
            return new Promise((resolve) => {
                const question = message + ' (y/n): ';
                controlDock.write(question);

                const handleKeypress = (char, key) => {
                    if (!key) return;

                    if (key.name === 'y') {
                        cleanup();
                        controlDock.write('y\n');
                        resolve(true);
                    } else if (key.name === 'n') {
                        cleanup();
                        controlDock.write('n\n');
                        resolve(false);
                    } else if (key.name === 'return') {
                        // Enter defaults to yes
                        cleanup();
                        controlDock.write('\n');
                        resolve(true);
                    }
                };

                const cleanup = () => {
                    rl.input.removeListener('keypress', handleKeypress);
                };

                rl.input.on('keypress', handleKeypress);
            });
        },

        /**
         * Request approval for tool execution
         */
        'approval-request': async (session, { tool, args, approvalId }) => {
            const approved = await controlDock.getApproval({ tool, args, approvalId });
            return { approved, approvalId };
        }
    };
}
