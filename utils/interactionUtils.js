async function safeDeferUpdate(interaction) {
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate();
        }
    } catch (_) {}
}

async function safeDeferReply(interaction, opts = {}) {
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply(opts);
        }
    } catch (_) {}
}

async function safeUpdate(interaction, data) {
    try {
        return await interaction.update(data);
    } catch (e) {
        try {
            // まずは対象メッセージへ直接編集を試みる（ボタン/セレクトの既存メッセージ）
            if (interaction.message && interaction.message.edit) {
                return await interaction.message.edit(data);
            }
        } catch (_) {}
        try {
            // 念のためACK後にeditReplyも試す（スラッシュ起点の応答がある場合）
            await safeDeferUpdate(interaction);
            return await interaction.editReply(data);
        } catch (_) {}
    }
}

async function safeEditReply(interaction, data) {
    try {
        return await interaction.editReply(data);
    } catch (e) {
        try {
            await safeDeferReply(interaction, { flags: 64 });
            return await interaction.editReply(data);
        } catch (_) {}
    }
}

async function safeFollowUp(interaction, data) {
    try {
        return await interaction.followUp(data);
    } catch (_) {}
}

module.exports = {
    safeDeferUpdate,
    safeDeferReply,
    safeUpdate,
    safeEditReply,
    safeFollowUp,
};



