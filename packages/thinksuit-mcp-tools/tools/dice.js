import { z } from 'zod';

const DICE_TYPES = {
    'd4': 4,
    'd6': 6,
    'd8': 8,
    'd10': 10,
    'd12': 12,
    'd20': 20,
    'd100': 100
};

function rollDice(sides) {
    return Math.floor(Math.random() * sides) + 1;
}

function interpretRoll(roll, sides, purpose) {
    const percentage = roll / sides;

    if (sides === 20) {
        if (roll === 1) return "Critical failure! 💀 Definitely don't do this.";
        if (roll === 20) return "Natural 20! 🎉 The dice gods smile upon you!";
        if (roll <= 5) return "Pretty bad roll. Maybe reconsider?";
        if (roll <= 10) return "Below average. Proceed with caution.";
        if (roll <= 15) return "Decent roll. Worth a shot.";
        return "Great roll! Go for it!";
    }

    if (percentage <= 0.1) return "Terrible roll. The universe says no.";
    if (percentage <= 0.25) return "Not looking good. Consider alternatives.";
    if (percentage <= 0.5) return "Meh. Could go either way.";
    if (percentage <= 0.75) return "Pretty good! Promising signs.";
    if (percentage <= 0.9) return "Excellent roll! Full steam ahead.";
    return "Outstanding! Maximum success indicated.";
}

export function registerDiceRoller(server) {
    server.tool(
        'roll_dice',
        {
            notation: z.string().optional().describe('Dice notation like "2d6+3" or "d20". Defaults to "d20"'),
            purpose: z.string().optional().describe('What decision or question the roll is for'),
            advantage: z.boolean().optional().describe('Roll twice and take higher (for d20 only)'),
            disadvantage: z.boolean().optional().describe('Roll twice and take lower (for d20 only)')
        },
        async ({ notation = 'd20', purpose, advantage = false, disadvantage = false }) => {
            try {
                const results = [];
                let total = 0;
                let formula = notation.toLowerCase();

                // Parse dice notation (e.g., "2d6+3", "d20", "3d8-2")
                const diceRegex = /(\d*)d(\d+)/g;
                const modifierRegex = /([+-]\d+)$/;

                let hasDice = false;
                let diceDetails = [];

                // Roll all dice in the notation
                formula = formula.replace(diceRegex, (match, count, sides) => {
                    hasDice = true;
                    const numDice = parseInt(count || '1');
                    const numSides = parseInt(sides);

                    if (numSides < 2 || numSides > 1000) {
                        throw new Error(`Invalid die size: d${numSides}`);
                    }

                    let rolls = [];
                    for (let i = 0; i < numDice; i++) {
                        let roll = rollDice(numSides);

                        // Handle advantage/disadvantage for d20
                        if (numSides === 20 && numDice === 1 && (advantage || disadvantage)) {
                            const roll2 = rollDice(numSides);
                            if (advantage) {
                                rolls.push(`${Math.max(roll, roll2)} (rolled ${roll} and ${roll2}, took higher)`);
                                roll = Math.max(roll, roll2);
                            } else {
                                rolls.push(`${Math.min(roll, roll2)} (rolled ${roll} and ${roll2}, took lower)`);
                                roll = Math.min(roll, roll2);
                            }
                        } else {
                            rolls.push(roll);
                        }

                        total += roll;
                    }

                    diceDetails.push({
                        dice: `${numDice}d${numSides}`,
                        rolls: rolls,
                        sum: rolls.reduce((a, b) => a + (typeof b === 'number' ? b : parseInt(b)), 0)
                    });

                    return rolls.reduce((a, b) => a + (typeof b === 'number' ? b : parseInt(b)), 0);
                });

                if (!hasDice) {
                    throw new Error(`Invalid dice notation: "${notation}". Use format like "d20", "2d6", or "3d8+2"`);
                }

                // Apply modifiers
                const modifierMatch = formula.match(modifierRegex);
                let modifier = 0;
                if (modifierMatch) {
                    modifier = parseInt(modifierMatch[1]);
                    total += modifier;
                }

                // Build response
                let response = `🎲 **Rolling ${notation}**${purpose ? ` for: "${purpose}"` : ''}\n\n`;

                // Show individual rolls
                for (const detail of diceDetails) {
                    response += `${detail.dice}: [${detail.rolls.join(', ')}]`;
                    if (detail.rolls.length > 1) {
                        response += ` = ${detail.sum}`;
                    }
                    response += '\n';
                }

                // Show modifier if any
                if (modifier !== 0) {
                    response += `Modifier: ${modifier >= 0 ? '+' : ''}${modifier}\n`;
                }

                // Show total
                response += `\n**Total: ${total}**\n\n`;

                // Add interpretation for single d20 rolls
                if (notation.toLowerCase() === 'd20' || (notation.toLowerCase() === '1d20' && !modifier)) {
                    const interpretation = interpretRoll(total, 20, purpose);
                    response += `*${interpretation}*`;
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: response
                        }
                    ]
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `🎲 **Dice Rolling Error**: ${error.message}\n\nTry notation like "d20", "2d6", "3d8+2", etc.`
                        }
                    ]
                };
            }
        }
    );
}