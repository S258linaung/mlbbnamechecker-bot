const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
require('dotenv').config();

// Configuration
const BOT_TOKEN = process.env.BOT_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL || 'https://mlbb-api.onrender.com/api/check';
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];

// Initialize bot
const bot = new Telegraf(BOT_TOKEN);

// Cache system to prevent spam
const userCooldown = new Map();
const COOLDOWN_TIME = 5000; // 5 seconds cooldown

// Function to check cooldown
function checkCooldown(userId) {
    const now = Date.now();
    const lastRequest = userCooldown.get(userId);
    
    if (lastRequest && (now - lastRequest) < COOLDOWN_TIME) {
        return Math.ceil((COOLDOWN_TIME - (now - lastRequest)) / 1000);
    }
    
    userCooldown.set(userId, now);
    return 0;
}

// Function to validate and check MLBB profile
async function checkMLBBProfile(gameId, serverId) {
    try {
        console.log(`[${new Date().toISOString()}] Checking: ${gameId}/${serverId}`);
        
        const response = await axios.get(`${API_BASE_URL}?id=${gameId}&serverid=${serverId}`, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Telegram-MLBB-Bot/1.0'
            }
        });
        
        return response.data;
    } catch (error) {
        console.error('API Check Error:', {
            message: error.message,
            code: error.code,
            url: `${API_BASE_URL}?id=${gameId}&serverid=${serverId}`
        });
        
        if (error.response) {
            return error.response.data;
        }
        
        return {
            status: 'error',
            message: 'Cannot connect to API service'
        };
    }
}

// Function to format profile message
function formatProfileMessage(profile, gameId, serverId) {
    const { nickname, country } = profile;
    
    let message = `🎮 *MLBB Profile Found*\n\n`;
    message += `👤 *Nickname:* ${nickname || 'Unknown'}\n`;
    message += `🌍 *Country:* ${country || 'Not specified'}\n`;
    message += `🆔 *Game ID:* ${gameId}\n`;
    message += `🔧 *Server ID:* ${serverId}\n`;
    message += `\n✅ *Profile Verified Successfully*\n`;
    
    // Add timestamp
    message += `\n_Checked at: ${new Date().toLocaleString('en-US', { 
        timeZone: 'Asia/Yangon',
        hour12: false 
    })}_`;
    
    return message;
}

// Start command
bot.start(async (ctx) => {
    const welcomeMessage = `
✨ *Welcome to MLBB Profile Checker Bot!* ✨

I can check Mobile Legends player profiles for you.

*How to use:*
1. Send Game ID and Server ID in this format:
   \`772413599/12350\`
   
   or
   
2. Use /check command

*Example:*
\`772413599/12350\`
\`123456789/54321\`

*Available Commands:*
/start - Show this message
/check - Check a profile
/help - Show help
/stats - Bot statistics (Admin only)

*Note:* Make sure Game ID and Server ID are correct!
    `;
    
    await ctx.reply(welcomeMessage, {
        parse_mode: 'Markdown',
        ...Markup.keyboard([
            ['/check', '/help'],
            ['Example: 772413599/12350']
        ]).resize()
    });
});

// Help command
bot.help((ctx) => {
    const helpMessage = `
📖 *MLBB Profile Checker Bot Help*

*Basic Usage:*
Just send Game ID and Server ID in this format:
\`GameID/ServerID\`

*Example:*
\`772413599/12350\`

*Format Rules:*
• Game ID: Numbers only (e.g., 772413599)
• Server ID: 4-5 digits (e.g., 12350)

*Commands:*
/start - Start the bot
/check - Manual check with prompts
/help - This help message
/stats - Bot statistics (Admin)

*Tips:*
1. Copy the exact Game ID from MLBB
2. Server ID is usually 4-5 digits
3. Use /check if format is confusing

*Need help?* Contact @yourusername
    `;
    
    ctx.reply(helpMessage, { parse_mode: 'Markdown' });
});

// Check command with interactive prompts
bot.command('check', async (ctx) => {
    await ctx.reply(
        'Please send Game ID and Server ID in this format:\n\n' +
        '`GameID/ServerID`\n\n' +
        '*Example:* `772413599/12350`',
        { parse_mode: 'Markdown' }
    );
});

// Stats command (Admin only)
bot.command('stats', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (!ADMIN_IDS.includes(userId)) {
        await ctx.reply('❌ This command is for admins only.');
        return;
    }
    
    const statsMessage = `
📊 *Bot Statistics*

*Cache Information:*
• Users in cache: ${userCooldown.size}

*Memory Usage:*
• RSS: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB
• Heap Total: ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB
• Heap Used: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB

*Uptime:* ${Math.round(process.uptime() / 60)} minutes
*Node Version:* ${process.version}
    `;
    
    await ctx.reply(statsMessage, { parse_mode: 'Markdown' });
});

// Handle text messages (auto-detect format)
bot.on('text', async (ctx) => {
    const message = ctx.message.text.trim();
    const userId = ctx.from.id.toString();
    const chatType = ctx.chat.type;
    
    // Skip if it's a command
    if (message.startsWith('/')) return;
    
    // Check cooldown
    const cooldown = checkCooldown(userId);
    if (cooldown > 0) {
        await ctx.reply(`⏳ Please wait ${cooldown} seconds before checking again.`);
        return;
    }
    
    // Show typing action
    await ctx.sendChatAction('typing');
    
    // Check if message matches format
    const match = message.match(/^(\d+)\/(\d{4,5})$/);
    
    if (!match) {
        // If in group chat, only respond to mentions or wrong format
        if (chatType === 'group' || chatType === 'supergroup') {
            // Check if bot is mentioned
            if (message.includes('@' + ctx.botInfo.username)) {
                await ctx.reply(
                    'Please use format: `GameID/ServerID`\n' +
                    '*Example:* `772413599/12350`',
                    { parse_mode: 'Markdown' }
                );
            }
            return; // Don't respond to random messages in groups
        }
        
        // In private chat, always respond to wrong format
        await ctx.reply(
            '❌ *Invalid Format!*\n\n' +
            'Please use: `GameID/ServerID`\n' +
            '*Example:* `772413599/12350`\n\n' +
            'Game ID: Numbers only\n' +
            'Server ID: 4-5 digits',
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    const gameId = match[1];
    const serverId = match[2];
    
    try {
        // Send checking message
        const checkingMsg = await ctx.reply(
            '🔍 *Checking profile...*\n' +
            `Game ID: ${gameId}\n` +
            `Server ID: ${serverId}`,
            { parse_mode: 'Markdown' }
        );
        
        // Check profile
        const result = await checkMLBBProfile(gameId, serverId);
        
        // Delete checking message
        await ctx.telegram.deleteMessage(ctx.chat.id, checkingMsg.message_id);
        
        if (result.status === 'success' && result.result) {
            const profile = result.result;
            const responseMessage = formatProfileMessage(profile, gameId, serverId);
            
            await ctx.reply(responseMessage, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    Markup.button.callback('Check Another', 'check_another')
                ])
            });
            
            // Log successful check
            console.log(`[SUCCESS] ${gameId}/${serverId} - ${profile.nickname}`);
            
        } else {
            const errorMessage = result.message || 'Profile not found';
            await ctx.reply(
                `❌ *Profile Check Failed*\n\n` +
                `*Reason:* ${errorMessage}\n` +
                `*Game ID:* ${gameId}\n` +
                `*Server ID:* ${serverId}\n\n` +
                `Please check:\n` +
                `1. Game ID is correct\n` +
                `2. Server ID is correct\n` +
                `3. Player exists\n` +
                `4. Try again later`,
                { parse_mode: 'Markdown' }
            );
        }
        
    } catch (error) {
        console.error('Bot Error:', error);
        await ctx.reply(
            '❌ *Error Occurred*\n\n' +
            'Unable to check profile at the moment.\n' +
            'Please try again later.',
            { parse_mode: 'Markdown' }
        );
    }
});

// Inline button handler
bot.action('check_another', async (ctx) => {
    await ctx.editMessageText(
        'Enter another Game ID and Server ID:\n\n' +
        'Format: `GameID/ServerID`\n' +
        'Example: `772413599/12350`',
        { parse_mode: 'Markdown' }
    );
    await ctx.answerCbQuery();
});

// Error handling
bot.catch((err, ctx) => {
    console.error(`[BOT ERROR] Update ${ctx.update.update_id}:`, err);
    
    if (ctx.chat) {
        ctx.reply(
            '❌ An error occurred. Please try again later.',
            { parse_mode: 'Markdown' }
        ).catch(console.error);
    }
});

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('Shutting down gracefully...');
    bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    bot.stop('SIGTERM');
});

// Start bot
bot.launch().then(() => {
    console.log(`
🤖 MLBB Telegram Bot Started!
==============================
Bot: @${bot.botInfo.username}
Time: ${new Date().toISOString()}
API URL: ${API_BASE_URL}
    `);
});
