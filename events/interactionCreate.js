const { Events, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const Interact = require('../utils/interactionUtils');
const PollUtils = require('../utils/pollUtils');
const moment = require('moment-timezone');
const config = require('../config');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        console.log('インタラクション受信:', {
            type: interaction.type,
            isChatInputCommand: interaction.isChatInputCommand(),
            isButton: interaction.isButton(),
            isStringSelectMenu: interaction.isStringSelectMenu(),
            customId: interaction.customId,
            commandName: interaction.commandName
        });
        
        // スラッシュコマンドの処理
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`コマンドが見つかりません: ${interaction.commandName}`);
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`コマンド実行エラー (${interaction.commandName}):`, error);
                
                const errorMessage = {
                    content: '❌ コマンド実行中にエラーが発生しました。',
                    ephemeral: true
                };

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
            return;
        }
        // オートコンプリート
        if (interaction.isAutocomplete()) {
            const { commandName } = interaction;
            try {
                if (commandName === 'add') {
                    const focused = interaction.options.getFocused(true);
                    if (focused?.name === 'role_name') {
                        const query = (focused.value || '').toLowerCase();
                        const roles = interaction.guild?.roles?.cache || [];
                        const choices = roles
                            .filter(r => !r.managed)
                            .map(r => ({ name: r.name, value: r.id }))
                            .filter(c => !query || c.name.toLowerCase().includes(query))
                            .slice(0, 25);
                        await interaction.respond(choices);
                        return;
                    }
                }
            } catch (e) {
                console.error('autocomplete エラー:', e);
                try { await interaction.respond([]); } catch {}
            }
        }
        
        if (interaction.isButton()) {
            const { customId } = interaction;
            
            // 投票ボタンの処理
            if (customId.startsWith('poll_vote_')) {
                await handlePollVote(interaction);
            }
            // 投票終了ボタンの処理
            else if (customId === 'poll_end') {
                await handlePollEnd(interaction);
            }
            // スケジュール投票確定・キャンセルボタン（優先処理）
            else if (customId === 'schedule_confirm_vote') {
                console.log('投票確定ボタンがクリックされました');
                await handleScheduleConfirmVote(interaction);
            }
            else if (customId === 'schedule_cancel_vote') {
                console.log('投票キャンセルボタンがクリックされました');
                await handleScheduleCancelVote(interaction);
            }
            else if (customId === 'schedule_view_results') {
                console.log('投票結果確認ボタンがクリックされました');
                await handleScheduleViewResults(interaction);
            }
            // その他のスケジュール関連のボタン処理
            else if (customId.startsWith('schedule_')) {
                await handleScheduleButton(interaction);
            }
            // specif ページング
            else if (customId === 'specif_page_1' || customId === 'specif_page_2') {
                await handleSpecifPageChange(interaction);
            }
            // specif 候補追加/投票作成
            else if (customId === 'specif_add_candidate') {
                await handleSpecifAddCandidate(interaction);
            }
            else if (customId === 'specif_create_poll') {
                await handleSpecifCreatePoll(interaction);
            }
            // delete 確認/キャンセル
            else if (customId.startsWith('delete_confirm_')) {
                await handleDeleteConfirm(interaction);
            }
            else if (customId.startsWith('delete_cancel_')) {
                await handleDeleteCancel(interaction);
            }
            // tbc 確定/キャンセル
            else if (customId === 'tbc_confirm') {
                await handleTbcConfirm(interaction);
            }
            else if (customId === 'tbc_cancel') {
                await handleTbcCancel(interaction);
            }
            // specif 月/日ボタン
            else if (customId.startsWith('specif_month_')) {
                await handleSpecifMonthChange(interaction);
            }
            else if (customId.startsWith('specif_date_')) {
                await handleSpecifDatePress(interaction);
            }
        }
        else if (interaction.isStringSelectMenu()) {
            const { customId } = interaction;
            
            if (customId === 'schedule_date_select') {
                await handleDateSelect(interaction);
            }
            else if (customId === 'schedule_time_select') {
                await handleTimeSelect(interaction);
            }
            else if (customId === 'schedule_multi_select') {
                await handleScheduleMultiSelect(interaction);
            }
            else if (customId === 'specif_time_select') {
                await handleSpecifTimeSelect(interaction);
            }
            else if (customId === 'remind_poll_select') {
                await handleRemindPollSelect(interaction);
            }
            else if (customId === 'remind_option_select') {
                await handleRemindOptionSelect(interaction);
            }
            else if (customId === 'autoremind_poll_select') {
                await handleAutoRemindPollSelect(interaction);
            }
            else if (customId === 'addrole_option_select') {
                await handleAddRoleOptionSelect(interaction);
            }
        }
        else if (interaction.isModalSubmit()) {
            const { customId } = interaction;
            
            if (customId === 'schedule_detailed_modal') {
                await handleDetailedSettings(interaction);
            }
            else if (customId === 'schedule_custom_time_modal') {
                await handleCustomTime(interaction);
            }
            else if (customId === 'remind_message_modal') {
                await handleRemindMessageSubmit(interaction);
            }
            else if (customId === 'autoremind_input_modal') {
                await handleAutoRemindInputSubmit(interaction);
            }
            else if (customId === 'add_role_time_modal') {
                await handleAddRoleTimeModal(interaction);
            }
        }
    },
};

async function handleDeleteConfirm(interaction) {
    try {
        console.log('delete_confirm 受信:', { customId: interaction.customId, messageId: interaction.message?.id });
        // 先にACK（タイムアウト回避）
        await Interact.safeDeferUpdate(interaction);

        const pollId = parseInt(interaction.customId.replace('delete_confirm_', ''));
        const poll = await interaction.client.database.getPollById(pollId);
        if (!poll) {
            try { await interaction.followUp({ content: '❌ 対象の投票が見つかりません。', flags: 64 }); } catch {}
            return;
        }
        if (poll.creator_id !== interaction.user.id) {
            try { await interaction.followUp({ content: '❌ 作成者のみが削除できます。', flags: 64 }); } catch {}
            return;
        }

        // 元の投票メッセージを削除
        try {
            const channel = await interaction.client.channels.fetch(poll.channel_id).catch(() => null);
            if (channel) {
                const msg = await channel.messages.fetch(poll.message_id).catch(() => null);
                if (msg) {
                    await msg.delete().catch(err => console.error('投票メッセージ削除失敗:', err));
                } else {
                    console.warn('投票メッセージが取得できませんでした（既に削除済みの可能性）');
                }
                // 関連メッセージの掃除（最大1000件までページング）
                try {
                    const botId = interaction.client.user.id;
                    let lastId = undefined;
                    for (let page = 0; page < 10; page++) {
                        const batch = await channel.messages.fetch({ limit: 100, before: lastId }).catch(err => { console.error('メッセージ取得エラー:', err); return null; });
                        if (!batch || batch.size === 0) break;
                        for (const [, m] of batch) {
                            lastId = m.id;
                            if (m.author?.id !== botId) continue;
                            const hasIdInContent = typeof m.content === 'string' && m.content.includes(`投票ID: ${poll.id}`);
                            const hasIdInEmbeds = Array.isArray(m.embeds) && m.embeds.some(e => (
                                (e.footer?.text || '').includes(`投票ID: ${poll.id}`) ||
                                (e.description || '').includes(`投票ID: ${poll.id}`) ||
                                (Array.isArray(e.fields) && e.fields.some(f => (
                                    (f.name || '').includes(`投票ID: ${poll.id}`) || (f.value || '').includes(`投票ID: ${poll.id}`)
                                )))
                            ));
                            const hasScheduleComponents = Array.isArray(m.components) && m.components.some(row =>
                                Array.isArray(row.components) && row.components.some(c => {
                                    const id = c?.data?.custom_id || c?.customId;
                                    return typeof id === 'string' && (id.startsWith('schedule_') || id.startsWith('poll_') || id === 'tbc_confirm' || id === 'tbc_cancel');
                                })
                            );
                            const hasDeleteComponents = Array.isArray(m.components) && m.components.some(row =>
                                Array.isArray(row.components) && row.components.some(c => {
                                    const id = c?.data?.custom_id || c?.customId;
                                    return typeof id === 'string' && (id.startsWith('delete_confirm_') || id.startsWith('delete_cancel_'));
                                })
                            );
                            if (hasIdInContent || hasIdInEmbeds || hasScheduleComponents || hasDeleteComponents) {
                                await m.delete().catch(err => console.error('関連メッセージ削除失敗:', err));
                            }
                        }
                        if (batch.size < 100) break;
                    }
                } catch (sweepErr) {
                    console.error('関連メッセージ掃除エラー:', sweepErr);
                }
            } else {
                console.warn('チャンネルが取得できませんでした');
            }
        } catch (e) {
            console.error('投票メッセージ取得/削除エラー:', e);
        }

        // DBから削除（関連レコードも）
        await interaction.client.database.deleteVotesByPollId(poll.id);
        await interaction.client.database.deleteScheduledRemindersByPollId(poll.id);
        await interaction.client.database.deletePollById(poll.id);

        // 確認メッセージも削除（押されたボタンのメッセージ）
        try {
            await interaction.message.delete();
        } catch (e) {
            console.error('確認メッセージ削除失敗:', e);
            // 削除できない場合は上書きして見えなくする
            try {
                await interaction.message.edit({ content: '✅ 削除済み', components: [], embeds: [] });
            } catch {}
        }
        // 予備でエフェメラル通知（残さない方針なら送らない）
    } catch (e) {
        console.error('handleDeleteConfirm エラー:', e);
        try {
            await interaction.followUp({ content: '❌ 削除処理中にエラーが発生しました。', flags: 64 });
        } catch {}
    }
}

// specif 月変更
async function handleSpecifMonthChange(interaction) {
    try {
        try { await Interact.safeDeferUpdate(interaction); } catch {}
        const monthStr = interaction.customId.replace('specif_month_', ''); // YYYY-MM
        const month = moment.tz(monthStr, 'YYYY-MM', config.DEFAULT_TIMEZONE);
        const daysInMonth = month.daysInMonth();
        const page = 1;
        const startDay = 1;
        const endDay = Math.min(15, daysInMonth);
        const dateButtons = [];
        const today = moment().tz(config.DEFAULT_TIMEZONE);
        const sess = interaction.client.scheduleSessions?.get(interaction.message.id);
        const selectedDates = sess?.selectedDates || interaction.client.specifSessions?.get(interaction.message.id)?.selectedDates || [];
        for (let d = startDay; d <= endDay; d++) {
            const date = month.clone().date(d);
            const isPast = date.isBefore(today, 'day');
            const label = d.toString();
            const dateStr = date.format('YYYY-MM-DD');
            const isSelected = selectedDates.includes(dateStr);
            const style = isSelected ? ButtonStyle.Success : (isPast ? ButtonStyle.Secondary : ButtonStyle.Primary);
            dateButtons.push(
                new ButtonBuilder()
                    .setCustomId(`specif_date_${dateStr}`)
                    .setLabel(label)
                    .setStyle(style)
                    .setDisabled(isPast)
            );
        }
        let rows = [];
        for (let i = 0; i < dateButtons.length; i += 5) {
            rows.push(new ActionRowBuilder().addComponents(...dateButtons.slice(i, i + 5)));
        }
        // 行数制限（ページャ行を確実に含めるため、日付行は最大3行）
        if (rows.length > 3) rows = rows.slice(0, 3);
        const hasSecondPage = daysInMonth > 15;
        const sessSched = interaction.client.scheduleSessions?.get(interaction.message.id);
        const curPage = sessSched?.page || 1;
        const pagerRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('specif_add_candidate').setLabel('候補を追加').setStyle(ButtonStyle.Success).setEmoji('➕'),
            new ButtonBuilder().setCustomId('specif_page_1').setLabel('1–15').setStyle(curPage === 1 ? ButtonStyle.Secondary : ButtonStyle.Primary).setDisabled(curPage === 1),
            new ButtonBuilder().setCustomId('specif_page_2').setLabel('16–31').setStyle(curPage === 2 ? ButtonStyle.Secondary : ButtonStyle.Primary).setDisabled(!hasSecondPage || curPage === 2)
        );
        // 月ボタン行を「前月・当月・翌月」で再構成（当月が中央で緑）
        const monthRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`specif_month_${month.clone().add(-1, 'month').format('YYYY-MM')}`).setLabel(`${month.clone().add(-1, 'month').format('M月')}`).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`specif_month_${month.format('YYYY-MM')}`).setLabel(`${month.format('M月')}`).setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`specif_month_${month.clone().add(1, 'month').format('YYYY-MM')}`).setLabel(`${month.clone().add(1, 'month').format('M月')}`).setStyle(ButtonStyle.Secondary)
        );
        const newComponents = [monthRow, ...rows, pagerRow];
        // セッションに選択月を保存
        if (sess) {
            sess.currentMonth = month.format('YYYY-MM');
            sess.page = 1;
            interaction.client.scheduleSessions.set(interaction.message.id, sess);
        }
        await Interact.safeUpdate(interaction, { components: newComponents });
    } catch (e) {
        console.error('specif 月変更エラー:', e);
        try { await interaction.followUp({ content: '❌ 月の切り替えでエラーが発生しました。', flags: 64 }); } catch {}
    }
}

// specif 日付押下（選択保存）
async function handleSpecifDatePress(interaction) {
    try {
        await Interact.safeDeferUpdate(interaction);
        const dateStr = interaction.customId.replace('specif_date_', ''); // YYYY-MM-DD
        if (!interaction.client.specifSessions) interaction.client.specifSessions = new Map();
        const key = interaction.message.id;
        const sess = interaction.client.specifSessions.get(key) || { selectedDates: [], selectedTimes: [] };
        if (!sess.selectedDates.includes(dateStr)) {
            sess.selectedDates.push(dateStr);
        } else {
            sess.selectedDates = sess.selectedDates.filter(d => d !== dateStr);
        }
        interaction.client.specifSessions.set(key, sess);
        // 日付ボタンを再描画（現在のページを維持し、選択済みは緑）
        const message = interaction.message;
        const monthRowOnMessage = message.components[0];
        // 中央（index=1）が当月ボタン
        const monthCenterBtn = monthRowOnMessage?.components?.[1];
        const monthId = monthCenterBtn?.data?.custom_id || monthCenterBtn?.customId;
        const currentMonthStr = monthId?.replace('specif_month_', '') || moment().tz(config.DEFAULT_TIMEZONE).format('YYYY-MM');
        const month = moment.tz(currentMonthStr, 'YYYY-MM', config.DEFAULT_TIMEZONE);
        const daysInMonth = month.daysInMonth();
        // 現在ページはセッションを優先し、なければ表示から推測
        const schedSess = interaction.client.scheduleSessions?.get(interaction.message.id);
        let currentPage = schedSess?.page || 1;
        if (!schedSess?.page) {
            const currentRows = message.components.slice(1, Math.max(1, message.components.length - 1));
            outer: for (const r of currentRows) {
                for (const c of r.components || []) {
                    const id = c?.data?.custom_id || c?.customId || '';
                    if (id.startsWith('specif_date_')) {
                        const ds = id.replace('specif_date_', '');
                        const dayNum = parseInt(ds.split('-')[2], 10);
                        if (!isNaN(dayNum) && dayNum >= 16) { currentPage = 2; break outer; }
                    }
                }
            }
        }
        const startDay = currentPage === 1 ? 1 : 16;
        const endDay = currentPage === 1 ? Math.min(15, daysInMonth) : daysInMonth;
        const today = moment().tz(config.DEFAULT_TIMEZONE);
        const dateButtons = [];
        for (let d = startDay; d <= endDay; d++) {
            const date = month.clone().date(d);
            const isPast = date.isBefore(today, 'day');
            const isSelected = sess.selectedDates.includes(date.format('YYYY-MM-DD'));
            dateButtons.push(
                new ButtonBuilder()
                    .setCustomId(`specif_date_${date.format('YYYY-MM-DD')}`)
                    .setLabel(d.toString())
                    .setStyle(isSelected ? ButtonStyle.Success : (isPast ? ButtonStyle.Secondary : ButtonStyle.Primary))
                    .setDisabled(isPast)
            );
        }
        let rows = [];
        for (let i = 0; i < dateButtons.length; i += 5) {
            rows.push(new ActionRowBuilder().addComponents(...dateButtons.slice(i, i + 5)));
        }
        if (rows.length > 3) rows = rows.slice(0, 3);
        const hasSecondPage = daysInMonth > 15;
        const pagerRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('specif_add_candidate').setLabel('候補を追加').setStyle(ButtonStyle.Success).setEmoji('➕'),
            new ButtonBuilder().setCustomId('specif_page_1').setLabel('1–15').setStyle(currentPage === 1 ? ButtonStyle.Secondary : ButtonStyle.Primary).setDisabled(currentPage === 1),
            new ButtonBuilder().setCustomId('specif_page_2').setLabel('16–31').setStyle(currentPage === 2 ? ButtonStyle.Secondary : ButtonStyle.Primary).setDisabled(!hasSecondPage || currentPage === 2)
        );
        // 月ボタン行を再生成（前月・当月・翌月、当月は緑）
        const monthRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`specif_month_${month.clone().add(-1, 'month').format('YYYY-MM')}`).setLabel(`${month.clone().add(-1, 'month').format('M月')}`).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`specif_month_${month.format('YYYY-MM')}`).setLabel(`${month.format('M月')}`).setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`specif_month_${month.clone().add(1, 'month').format('YYYY-MM')}`).setLabel(`${month.clone().add(1, 'month').format('M月')}`).setStyle(ButtonStyle.Secondary)
        );
        await Interact.safeUpdate(interaction, { components: [monthRow, ...rows, pagerRow] });
    } catch (e) {
        console.error('specif 日付選択エラー:', e);
        try { await interaction.followUp({ content: '❌ 日付選択でエラーが発生しました。', flags: 64 }); } catch {}
    }
}

async function handleDeleteCancel(interaction) {
    try {
        try { await Interact.safeDeferUpdate(interaction); } catch {}
        try { await Interact.safeFollowUp(interaction, { content: 'キャンセルしました。', flags: 64 }); } catch {}
    } catch {}
}

async function handleTbcConfirm(interaction) {
    try {
        try { await Interact.safeDeferUpdate(interaction); } catch {}
        try { await Interact.safeFollowUp(interaction, { content: '✅ 日程を確定しました。', flags: 64 }); } catch {}
    } catch (e) {
        console.error('handleTbcConfirm エラー:', e);
        try {
            await interaction.followUp({ content: '❌ 確定処理中にエラーが発生しました。', flags: 64 });
        } catch {}
    }
}

async function handleTbcCancel(interaction) {
    try {
        try { await Interact.safeDeferUpdate(interaction); } catch {}
        try { await Interact.safeFollowUp(interaction, { content: 'キャンセルしました。', flags: 64 }); } catch {}
    } catch {}
}

// add role のモーダル処理
async function handleAddRoleTimeModal(interaction) {
    try {
        const session = interaction.client.addRoleSessions?.get(interaction.user.id);
        if (!session) {
            await interaction.reply({ content: '❌ セッションが無効です。やり直してください。', flags: 64 });
            return;
        }
        const poll = await interaction.client.database.getPollById(session.pollId);
        if (!poll) {
            await interaction.reply({ content: '❌ 投票が見つかりません。', flags: 64 });
            return;
        }

        const hhmm = interaction.fields.getTextInputValue('add_role_time_hhmm');
        const mmdd = interaction.fields.getTextInputValue('add_role_date_mmdd');

        if (!/^\d{4}$/.test(hhmm)) {
            await interaction.reply({ content: '❌ 時間はHHMM形式で入力してください（例: 1800）', flags: 64 });
            return;
        }
        const hour = parseInt(hhmm.substring(0, 2));
        const minute = parseInt(hhmm.substring(2, 4));
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            await interaction.reply({ content: '❌ 無効な時間です。', flags: 64 });
            return;
        }

        let targetDate;
        if (mmdd && mmdd.length > 0) {
            if (!/^\d{4}$/.test(mmdd)) {
                await interaction.reply({ content: '❌ 日付はMMDD形式で入力してください（例: 0919）', flags: 64 });
                return;
            }
            const month = parseInt(mmdd.substring(0, 2));
            const day = parseInt(mmdd.substring(2, 4));
            if (month < 1 || month > 12 || day < 1 || day > 31) {
                await interaction.reply({ content: '❌ 無効な日付です。', flags: 64 });
                return;
            }
            const currentYear = moment().year();
            targetDate = moment.tz(`${currentYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`, 'Asia/Tokyo');
        } else {
            targetDate = moment().tz('Asia/Tokyo');
        }

        // 対象オプションを検索
        let targetOptionIndex = -1;
        for (let i = 0; i < poll.options.length; i++) {
            const opt = poll.options[i];
            if (opt.includes(targetDate.format('MM/DD')) && opt.includes(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`)) {
                targetOptionIndex = i;
                break;
            }
        }
        if (targetOptionIndex === -1) {
            await interaction.reply({ content: `❌ 対象日時に一致する候補が見つかりませんでした。`, flags: 64 });
            return;
        }

        // 投票者を取得
        const votes = await interaction.client.database.getVotes(poll.id);
        const voters = votes.filter(v => v.option_index === targetOptionIndex);
        if (voters.length === 0) {
            await interaction.reply({ content: '❌ 該当日時に投票した人がいません。', flags: 64 });
            return;
        }

        // ロール付与
        const role = interaction.guild.roles.cache.find(r => r.name === session.roleName);
        if (!role) {
            await interaction.reply({ content: `❌ ロール「${session.roleName}」が見つかりません。`, flags: 64 });
            return;
        }
        if (!interaction.guild.members.me.permissions.has('ManageRoles')) {
            await interaction.reply({ content: '❌ ロールを管理する権限がありません。', flags: 64 });
            return;
        }

        let successCount = 0;
        let failCount = 0;
        const results = [];
        for (const vote of voters) {
            try {
                const member = await interaction.guild.members.fetch(vote.user_id);
                if (member && !member.roles.cache.has(role.id)) {
                    await member.roles.add(role);
                    successCount++;
                    results.push(`✅ <@${vote.user_id}> にロール「${session.roleName}」を付与しました`);
                } else if (member && member.roles.cache.has(role.id)) {
                    results.push(`⚠️ <@${vote.user_id}> は既にロール「${session.roleName}」を持っています`);
                } else {
                    failCount++;
                    results.push(`❌ <@${vote.user_id}> のロール付与に失敗（ユーザー不明）`);
                }
            } catch (e) {
                failCount++;
                results.push(`❌ <@${vote.user_id}> のロール付与に失敗`);
            }
        }

        const embed = new EmbedBuilder()
            .setTitle('🎭 ロール付与結果')
            .setColor(successCount > 0 ? 0x00FF00 : 0xFF0000)
            .addFields(
                { name: '📊 投票', value: poll.title, inline: true },
                { name: '📅 対象日時', value: `${targetDate.format('MM月DD日')} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`, inline: true },
                { name: '🎭 ロール', value: session.roleName, inline: true },
                { name: '📈 結果', value: `成功: ${successCount}名\n失敗: ${failCount}名`, inline: true }
            )
            .setTimestamp();

        const display = results.slice(0, 10);
        if (results.length > 10) display.push(`... 他${results.length - 10}件`);
        embed.addFields({ name: '📋 詳細結果', value: display.join('\n') });

        await interaction.reply({ embeds: [embed] });
        interaction.client.addRoleSessions.delete(interaction.user.id);
    } catch (e) {
        console.error('handleAddRoleTimeModal エラー:', e);
        try { await interaction.reply({ content: '❌ ロール付与中にエラーが発生しました。', flags: 64 }); } catch {}
    }
}

async function handleAddRoleOptionSelect(interaction) {
    try {
        const session = interaction.client.addRoleSessions?.get(interaction.user.id);
        if (!session) {
            await interaction.reply({ content: '❌ セッションが無効です。やり直してください。', flags: 64 });
            return;
        }
        const optionIndex = parseInt(interaction.values[0]);
        const poll = await interaction.client.database.getPollById(session.pollId);
        if (!poll) {
            await interaction.reply({ content: '❌ 投票が見つかりません。', flags: 64 });
            return;
        }

        const votes = await interaction.client.database.getVotes(poll.id);
        const voters = votes.filter(v => v.option_index === optionIndex);
        if (voters.length === 0) {
            await interaction.reply({ content: '❌ 該当日時に投票した人がいません。', flags: 64 });
            return;
        }

        const role = interaction.guild.roles.cache.get(session.roleId);
        if (!role) {
            await interaction.reply({ content: `❌ ロールが見つかりません。`, flags: 64 });
            return;
        }
        if (!interaction.guild.members.me.permissions.has('ManageRoles')) {
            await interaction.reply({ content: '❌ ロールを管理する権限がありません。', flags: 64 });
            return;
        }

        let successCount = 0;
        let failCount = 0;
        const results = [];
        for (const vote of voters) {
            try {
                const member = await interaction.guild.members.fetch(vote.user_id);
                if (member && !member.roles.cache.has(role.id)) {
                    await member.roles.add(role);
                    successCount++;
                    results.push(`✅ <@${vote.user_id}> にロール「${role.name}」を付与しました`);
                } else if (member && member.roles.cache.has(role.id)) {
                    results.push(`⚠️ <@${vote.user_id}> は既にロール「${role.name}」を持っています`);
                } else {
                    failCount++;
                    results.push(`❌ <@${vote.user_id}> のロール付与に失敗（ユーザー不明）`);
                }
            } catch (e) {
                failCount++;
                results.push(`❌ <@${vote.user_id}> のロール付与に失敗`);
            }
        }

        const display = results.slice(0, 10);
        if (results.length > 10) display.push(`... 他${results.length - 10}件`);
        await interaction.reply({
            content: `🎭 ロール付与結果\n投票: ${poll.title}\n対象: ${poll.options[optionIndex]}\nロール: ${role.name}\n成功: ${successCount}名 失敗: ${failCount}名\n\n${display.join('\n')}`,
            flags: 64
        });

        interaction.client.addRoleSessions.delete(interaction.user.id);
    } catch (e) {
        console.error('handleAddRoleOptionSelect エラー:', e);
        try { await interaction.reply({ content: '❌ ロール付与中にエラーが発生しました。', flags: 64 }); } catch {}
    }
}

async function handlePollVote(interaction) {
    try {
        try { await Interact.safeDeferUpdate(interaction); } catch {}
        const optionIndex = parseInt(interaction.customId.split('_')[2]);
        
        // データベースから投票情報を取得
        const poll = await interaction.client.database.getPoll(interaction.message.id);
        
        if (!poll) {
            await interaction.reply({ 
                content: '❌ この投票は見つかりませんでした。', 
                ephemeral: true 
            });
            return;
        }

        // 投票期限チェック
        if (poll.expires_at && new Date() > new Date(poll.expires_at)) {
            await interaction.reply({ 
                content: '❌ この投票は期限切れです。', 
                ephemeral: true 
            });
            return;
        }

        // 既存投票があるか確認（同じ選択肢ならトグルで取り消し）
        const existingVotes = await interaction.client.database.getVotes(poll.id);
        const hasThisVote = existingVotes.some(v => v.user_id === interaction.user.id && v.option_index === optionIndex);
        if (hasThisVote) {
            await interaction.client.database.deleteUserVote(poll.id, interaction.user.id, optionIndex);
        } else {
            // なければ追加
            await interaction.client.database.addVote(poll.id, interaction.user.id, optionIndex);
        }
        
        // 投票結果を取得
        const votes = await interaction.client.database.getVotes(poll.id);
        const voteCounts = {};
        
        votes.forEach(vote => {
            if (!voteCounts[vote.option_index]) {
                voteCounts[vote.option_index] = [];
            }
            voteCounts[vote.option_index].push(`<@${vote.user_id}>`);
        });

        // 投票結果をデータベースに更新
        await interaction.client.database.updatePollVotes(poll.id, voteCounts);

        // メッセージを更新（埋め込みではなく本文で表示）
        const updatedText = PollUtils.createPollText(poll, voteCounts);
        // 自分が選んだ選択肢を緑にハイライト
        const mySelected = [];
        Object.entries(voteCounts).forEach(([idx, users]) => {
            if (users.some(u => u.includes(interaction.user.id))) mySelected.push(parseInt(idx));
        });
        const buttons = PollUtils.createPollButtons(poll.poll_type, poll.options, mySelected);
        await Interact.safeUpdate(interaction, {
            content: updatedText,
            embeds: [],
            components: buttons
        });

        // 投票/取消の結果を通知
        await Interact.safeFollowUp(interaction, {
            content: hasThisVote ? `↩️ ${poll.options[optionIndex]} を取り消しました` : `✅ ${poll.options[optionIndex]} に投票しました！`,
            flags: 64
        });

    } catch (error) {
        console.error('投票処理エラー:', error);
        try { await Interact.safeFollowUp(interaction, { content: '❌ 投票処理中にエラーが発生しました。', flags: 64 }); } catch {}
    }
}

// specif のページング切替
async function handleSpecifPageChange(interaction) {
    try {
        // まずACK（3秒制限回避）
        try { await Interact.safeDeferUpdate(interaction); } catch {}

        const page = interaction.customId.endsWith('_2') ? 2 : 1;
        const session = interaction.client.scheduleSessions?.get(interaction.message.id);

        const baseMonthStr = session?.currentMonth || moment().tz(config.DEFAULT_TIMEZONE).format('YYYY-MM');
        const month = moment.tz(baseMonthStr, 'YYYY-MM', config.DEFAULT_TIMEZONE);

        // 1–15 か 16–末 のボタン生成
        const today = moment().tz(config.DEFAULT_TIMEZONE);
        const daysInMonth = month.daysInMonth();
        const startDay = page === 1 ? 1 : 16;
        const endDay = page === 1 ? Math.min(15, daysInMonth) : daysInMonth;

        const dateButtons = [];
        for (let day = startDay; day <= endDay; day++) {
            const date = month.clone().date(day);
            const dateStr = date.format('YYYY-MM-DD');
            const isToday = date.isSame(today, 'day');
            const isPast = date.isBefore(today, 'day');
            const sess = interaction.client.specifSessions?.get(interaction.message.id);
            const selectedDates = sess?.selectedDates || [];
            let style = selectedDates.includes(dateStr) ? ButtonStyle.Success : ButtonStyle.Primary;
            let label = day.toString();
            if (isToday) {
                if (!selectedDates.includes(dateStr)) {
                    style = ButtonStyle.Success;
                }
                label = `[${day}]`;
            } else if (isPast) {
                style = ButtonStyle.Secondary;
                label = `~~${day}~~`;
            }
            dateButtons.push(
                new ButtonBuilder()
                    .setCustomId(`specif_date_${dateStr}`)
                    .setLabel(label)
                    .setStyle(style)
                    .setDisabled(isPast)
            );
        }

        let dateRows = [];
        for (let i = 0; i < dateButtons.length; i += 5) {
            const rowButtons = dateButtons.slice(i, i + 5);
            if (rowButtons.length > 0) {
                dateRows.push(new ActionRowBuilder().addComponents(...rowButtons));
            }
        }
        if (dateRows.length > 3) dateRows = dateRows.slice(0, 3);

        const hasSecondPage = daysInMonth > 15;
        const prevBtn = new ButtonBuilder()
            .setCustomId('specif_page_1')
            .setLabel('1–15')
            .setStyle(page === 1 ? ButtonStyle.Secondary : ButtonStyle.Primary)
            .setDisabled(page === 1);
        const nextBtn = new ButtonBuilder()
            .setCustomId('specif_page_2')
            .setLabel('16–31')
            .setStyle(page === 2 ? ButtonStyle.Secondary : ButtonStyle.Primary)
            .setDisabled(!hasSecondPage || page === 2);

        // 既存コンポーネントを取得
        const existing = interaction.message.components;
        // 月ボタンはセッションのcurrentMonthを基準に再生成し、現在ページに関わらず選択月をハイライト
        const baseMonth = month;
        const monthRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`specif_month_${baseMonth.clone().add(-1, 'month').format('YYYY-MM')}`).setLabel(`${baseMonth.clone().add(-1, 'month').format('M月')}`).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`specif_month_${baseMonth.format('YYYY-MM')}`).setLabel(`${baseMonth.format('M月')}`).setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`specif_month_${baseMonth.clone().add(1, 'month').format('YYYY-MM')}`).setLabel(`${baseMonth.clone().add(1, 'month').format('M月')}`).setStyle(ButtonStyle.Secondary)
        );
        // 末尾行を再構成（候補追加/ページャ）
        const addRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('specif_add_candidate').setLabel('候補を追加').setStyle(ButtonStyle.Success).setEmoji('➕'),
            prevBtn,
            nextBtn
        );

        const newComponents = [monthRow, ...dateRows, addRow];

        // セッション更新
        if (session) {
            session.page = page;
            interaction.client.scheduleSessions.set(interaction.message.id, session);
        }

        await Interact.safeUpdate(interaction, { components: newComponents });
    } catch (error) {
        console.error('specifページ切替エラー:', error);
        try { await Interact.safeFollowUp(interaction, { content: '❌ ページ切替中にエラーが発生しました。', flags: 64 }); } catch {}
    }
}

async function handlePollEnd(interaction) {
    try {
        try { await Interact.safeDeferUpdate(interaction); } catch {}
        // 投票作成者のみが終了できるかチェック
        const poll = await interaction.client.database.getPoll(interaction.message.id);
        
        if (!poll) {
            await interaction.reply({ 
                content: '❌ この投票は見つかりませんでした。', 
                ephemeral: true 
            });
            return;
        }

        if (poll.creator_id !== interaction.user.id) {
            await interaction.reply({ 
                content: '❌ 投票の作成者のみが投票を終了できます。', 
                ephemeral: true 
            });
            return;
        }

        // 投票を非アクティブにする
        await interaction.client.database.deactivatePoll(interaction.message.id);

        // 最終結果を取得
        const votes = await interaction.client.database.getVotes(poll.id);
        const voteCounts = {};
        
        votes.forEach(vote => {
            if (!voteCounts[vote.option_index]) {
                voteCounts[vote.option_index] = [];
            }
            voteCounts[vote.option_index].push(`<@${vote.user_id}>`);
        });

        // 最終結果のEmbedを作成
        const finalEmbed = new EmbedBuilder()
            .setTitle(`🏁 ${poll.title} - 投票終了`)
            .setColor(0xFF6B6B)
            .setDescription('投票が終了しました。結果は以下の通りです。')
            .setTimestamp();

        const totalVotes = Object.values(voteCounts).reduce((sum, voters) => sum + voters.length, 0);
        
        if (totalVotes > 0) {
            finalEmbed.addFields({
                name: `📊 最終結果 (${totalVotes}票)`,
                value: PollUtils.formatVoteResults(poll.options, voteCounts),
                inline: false
            });

            // 最多得票の選択肢をハイライト
            let maxVotes = 0;
            let winningOptions = [];
            
            Object.entries(voteCounts).forEach(([index, voters]) => {
                if (voters.length > maxVotes) {
                    maxVotes = voters.length;
                    winningOptions = [poll.options[index]];
                } else if (voters.length === maxVotes && maxVotes > 0) {
                    winningOptions.push(poll.options[index]);
                }
            });

            if (winningOptions.length > 0) {
                finalEmbed.addFields({
                    name: '🏆 最多得票',
                    value: winningOptions.join(', '),
                    inline: false
                });
            }
        } else {
            finalEmbed.addFields({
                name: '📊 結果',
                value: '投票がありませんでした。',
                inline: false
            });
        }

        // ボタンを削除して最終結果を表示
        await Interact.safeUpdate(interaction, {
            embeds: [finalEmbed],
            components: []
        });

    } catch (error) {
        console.error('投票終了処理エラー:', error);
        try { await Interact.safeFollowUp(interaction, { content: '❌ 投票終了処理中にエラーが発生しました。', flags: 64 }); } catch {}
    }
}

// スケジュール関連のボタンハンドラー
async function handleScheduleButton(interaction) {
    const { customId } = interaction;
    
    if (customId === 'schedule_detailed_settings') {
        await showDetailedSettingsModal(interaction);
    }
    else if (customId === 'schedule_time_custom') {
        await showCustomTimeModal(interaction);
    }
    else if (customId.startsWith('schedule_time_')) {
        await handleTimeSlotSelection(interaction);
    }
    else if (customId === 'schedule_create_poll') {
        await createSchedulePoll(interaction);
    }
}

// 日付選択ハンドラー
async function handleDateSelect(interaction) {
    try {
        try { await Interact.safeDeferUpdate(interaction); } catch {}
        const selectedDates = interaction.values;
        const sessionData = interaction.client.scheduleSessions?.get(interaction.message.id);
        
        if (!sessionData) {
            await interaction.reply({
                content: '❌ セッションデータが見つかりません。',
                ephemeral: true
            });
            return;
        }
        
        sessionData.selectedDates = selectedDates;
        interaction.client.scheduleSessions.set(interaction.message.id, sessionData);
        
        // 時間選択メニューを表示
        const timeSelectMenu = createTimeSelectMenu();
        const row = new ActionRowBuilder().addComponents(timeSelectMenu);
        
        await Interact.safeUpdate(interaction, { components: [row] });
        
    } catch (error) {
        console.error('日付選択エラー:', error);
        try { await Interact.safeFollowUp(interaction, { content: '❌ 日付選択中にエラーが発生しました。', flags: 64 }); } catch {}
    }
}

// 時間選択ハンドラー
async function handleTimeSelect(interaction) {
    try {
        try { await Interact.safeDeferUpdate(interaction); } catch {}
        const selectedTimes = interaction.values;
        const sessionData = interaction.client.scheduleSessions?.get(interaction.message.id);
        
        if (!sessionData) {
            await interaction.reply({
                content: '❌ セッションデータが見つかりません。',
                ephemeral: true
            });
            return;
        }
        
        sessionData.selectedTimes = selectedTimes;
        interaction.client.scheduleSessions.set(interaction.message.id, sessionData);
        
        // 投票作成ボタンを表示
        const createButton = new ButtonBuilder()
            .setCustomId('schedule_create_poll')
            .setLabel('投票を作成')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅');
        
        const row = new ActionRowBuilder().addComponents(createButton);
        
        await Interact.safeUpdate(interaction, { components: [row] });
        
    } catch (error) {
        console.error('時間選択エラー:', error);
        try { await Interact.safeFollowUp(interaction, { content: '❌ 時間選択中にエラーが発生しました。', flags: 64 }); } catch {}
    }
}

// 時間帯選択ハンドラー
async function handleTimeSlotSelection(interaction) {
    try {
        try { await Interact.safeDeferUpdate(interaction); } catch {}
        const timeSlot = interaction.customId.replace('schedule_time_', '');
        const sessionData = interaction.client.scheduleSessions?.get(interaction.message.id);
        
        if (!sessionData) {
            await interaction.reply({
                content: '❌ セッションデータが見つかりません。',
                ephemeral: true
            });
            return;
        }
        
        // 時間帯に応じた時間を設定
        let times = [];
        switch (timeSlot) {
            case 'morning':
                times = ['09:00', '10:00', '11:00', '12:00'];
                break;
            case 'afternoon':
                times = ['13:00', '14:00', '15:00', '16:00', '17:00'];
                break;
            case 'evening':
                times = ['18:00', '19:00', '20:00', '21:00'];
                break;
        }
        
        sessionData.selectedTimes = times;
        interaction.client.scheduleSessions.set(interaction.message.id, sessionData);
        
        // 投票作成ボタンを表示
        const createButton = new ButtonBuilder()
            .setCustomId('schedule_create_poll')
            .setLabel('投票を作成')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅');
        
        const row = new ActionRowBuilder().addComponents(createButton);
        
        await Interact.safeUpdate(interaction, { components: [row] });
        
    } catch (error) {
        console.error('時間帯選択エラー:', error);
        try { await Interact.safeFollowUp(interaction, { content: '❌ 時間帯選択中にエラーが発生しました。', flags: 64 }); } catch {}
    }
}

// 詳細設定モーダル表示
async function showDetailedSettingsModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('schedule_detailed_modal')
        .setTitle('詳細設定');

    const minuteInput = new TextInputBuilder()
        .setCustomId('minute_input')
        .setLabel('分単位で時間を指定')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('例: 14:30, 16:45, 18:15')
        .setRequired(false);

    const durationInput = new TextInputBuilder()
        .setCustomId('duration_input')
        .setLabel('投票期限（時間）')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('例: 24')
        .setRequired(false);

    const row1 = new ActionRowBuilder().addComponents(minuteInput);
    const row2 = new ActionRowBuilder().addComponents(durationInput);

    modal.addComponents(row1, row2);

    await interaction.showModal(modal);
}

// カスタム時間モーダル表示
async function showCustomTimeModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('schedule_custom_time_modal')
        .setTitle('カスタム時間設定');

    const timeInput = new TextInputBuilder()
        .setCustomId('custom_time_input')
        .setLabel('時間を指定（HH:MM形式、カンマ区切り）')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('例: 09:30, 14:15, 18:45, 20:00')
        .setRequired(true);

    const row = new ActionRowBuilder().addComponents(timeInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
}

// 詳細設定処理
async function handleDetailedSettings(interaction) {
    try {
        const minuteInput = interaction.fields.getTextInputValue('minute_input');
        const durationInput = interaction.fields.getTextInputValue('duration_input');
        
        const sessionData = interaction.client.scheduleSessions?.get(interaction.message.id);
        if (!sessionData) {
            await interaction.reply({
                content: '❌ セッションデータが見つかりません。',
                ephemeral: true
            });
            return;
        }
        
        // 分単位の時間を解析
        if (minuteInput) {
            const times = minuteInput.split(',').map(t => t.trim()).filter(t => t);
            sessionData.selectedTimes = times;
        }
        
        // 投票期限を設定
        if (durationInput) {
            const hours = parseInt(durationInput);
            if (!isNaN(hours) && hours > 0) {
                sessionData.detailedSettings.expireHours = hours;
            }
        }
        
        interaction.client.scheduleSessions.set(interaction.message.id, sessionData);
        
        await interaction.reply({
            content: '✅ 詳細設定を保存しました。',
            ephemeral: true
        });
        
    } catch (error) {
        console.error('詳細設定エラー:', error);
        await interaction.reply({
            content: '❌ 詳細設定の保存中にエラーが発生しました。',
            ephemeral: true
        });
    }
}

// カスタム時間処理
async function handleCustomTime(interaction) {
    try {
        const timeInput = interaction.fields.getTextInputValue('custom_time_input');
        
        const sessionData = interaction.client.scheduleSessions?.get(interaction.message.id);
        if (!sessionData) {
            await interaction.reply({
                content: '❌ セッションデータが見つかりません。',
                ephemeral: true
            });
            return;
        }
        
        // 時間を解析
        const times = timeInput.split(',').map(t => t.trim()).filter(t => t);
        sessionData.selectedTimes = times;
        interaction.client.scheduleSessions.set(interaction.message.id, sessionData);
        
        // 投票作成ボタンを表示
        const createButton = new ButtonBuilder()
            .setCustomId('schedule_create_poll')
            .setLabel('投票を作成')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅');
        
        const row = new ActionRowBuilder().addComponents(createButton);
        
        await interaction.update({
            components: [row]
        });
        
    } catch (error) {
        console.error('カスタム時間エラー:', error);
        await interaction.reply({
            content: '❌ カスタム時間の設定中にエラーが発生しました。',
            ephemeral: true
        });
    }
}

// 時間選択メニュー作成
function createTimeSelectMenu() {
    const options = [];
    
    // 24時間分のオプションを作成（15分間隔）
    for (let hour = 0; hour < 24; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
            const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            options.push({
                label: timeStr,
                value: timeStr,
                description: `${hour}時${minute}分`
            });
        }
    }
    
    return new StringSelectMenuBuilder()
        .setCustomId('schedule_time_select')
        .setPlaceholder('時間を選択してください（複数選択可能）')
        .setMinValues(1)
        .setMaxValues(10)
        .addOptions(options.slice(0, 25)); // Discordの制限で25個まで
}

// スケジュール投票作成
async function createSchedulePoll(interaction) {
    try {
        const sessionData = interaction.client.scheduleSessions?.get(interaction.message.id);
        
        if (!sessionData) {
            await interaction.reply({
                content: '❌ セッションデータが見つかりません。',
                ephemeral: true
            });
            return;
        }
        
        if (!sessionData.selectedDates || sessionData.selectedDates.length === 0) {
            await interaction.reply({
                content: '❌ 日付が選択されていません。',
                ephemeral: true
            });
            return;
        }
        
        if (!sessionData.selectedTimes || sessionData.selectedTimes.length === 0) {
            await interaction.reply({
                content: '❌ 時間が選択されていません。',
                ephemeral: true
            });
            return;
        }
        
        // オプションを生成
        const options = [];
        sessionData.selectedDates.forEach(date => {
            sessionData.selectedTimes.forEach(time => {
                const momentDate = moment(date).tz('Asia/Tokyo');
                options.push(`${momentDate.format('MM/DD (ddd)')} ${time}`);
            });
        });
        
        // 投票期限を設定
        const expireHours = sessionData.detailedSettings?.expireHours || 24;
        const expiresAt = moment().add(expireHours, 'hours').toISOString();
        
        // データベースに投票を保存
        const pollId = await interaction.client.database.createPoll({
            messageId: null,
            channelId: interaction.channel.id,
            guildId: interaction.guild.id,
            creatorId: interaction.user.id,
            title: sessionData.title,
            description: sessionData.description,
            pollType: 'schedule',
            options: options,
            expiresAt: expiresAt
        });
        
        // 表示テキストを作成（埋め込みを使わず本文で表示）
        const text = PollUtils.createPollText({
            id: pollId,
            title: sessionData.title,
            description: sessionData.description,
            options: options,
            expires_at: expiresAt
        }, {});

        // ボタンを作成
        const buttons = PollUtils.createPollButtons('schedule', options);
        
        // 投票メッセージを送信（本文のみ）
        const pollMessage = await interaction.editReply({
            content: text,
            embeds: [],
            components: buttons
        });
        
        // データベースのmessage_idを更新
        await interaction.client.database.db.run(
            'UPDATE polls SET message_id = ? WHERE id = ?',
            [pollMessage.id, pollId]
        );
        
        // セッションデータを削除
        interaction.client.scheduleSessions.delete(interaction.message.id);
        
        await interaction.followUp({
            content: `✅ スケジュール投票「${sessionData.title}」を作成しました！\n📅 ${options.length}個の候補から選択してください。`,
            ephemeral: true
        });
        
    } catch (error) {
        console.error('スケジュール投票作成エラー:', error);
        await interaction.reply({
            content: '❌ 投票作成中にエラーが発生しました。',
            ephemeral: true
        });
    }
}

// スケジュール複数選択ハンドラー
async function handleScheduleMultiSelect(interaction) {
    try {
        console.log('SelectMenu選択処理開始:', {
            userId: interaction.user.id,
            messageId: interaction.message.id,
            selectedValues: interaction.values
        });
        // すぐにACKしてタイムアウトを防止
        try { await Interact.safeDeferUpdate(interaction); } catch {}
        
        const selectedOptions = interaction.values;
        
        // 選択された候補を一時保存
        if (!interaction.client.scheduleSelections) {
            interaction.client.scheduleSelections = new Map();
        }
        
        interaction.client.scheduleSelections.set(interaction.user.id, {
            messageId: interaction.message.id,
            selectedOptions: selectedOptions,
            timestamp: Date.now()
        });
        
        console.log('選択データを保存:', {
            userId: interaction.user.id,
            selectedOptions: selectedOptions,
            messageId: interaction.message.id
        });
        
        // 非公開で通知
        await Interact.safeFollowUp(interaction, {
            content: `✅ ${selectedOptions.length}個の候補を選択しました。`,
            flags: 64
        });
        
        console.log('SelectMenu選択処理完了');
        
    } catch (error) {
        console.error('スケジュール複数選択エラー:', error);
        console.error('エラーの詳細:', {
            message: error.message,
            stack: error.stack
        });
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: '❌ 選択処理中にエラーが発生しました。', flags: 64 });
            } else {
                await interaction.reply({ content: '❌ 選択処理中にエラーが発生しました。', flags: 64 });
            }
        } catch {}
    }
}

// スケジュール投票確定ハンドラー
async function handleScheduleConfirmVote(interaction) {
    try {
        console.log('投票確定処理開始:', {
            userId: interaction.user.id,
            messageId: interaction.message.id
        });
        
        const userSelections = interaction.client.scheduleSelections?.get(interaction.user.id);
        
        console.log('ユーザー選択データ:', userSelections);
        
        if (!userSelections || userSelections.messageId !== interaction.message.id) {
            console.log('投票データが見つからない:', {
                hasSelections: !!userSelections,
                messageIdMatch: userSelections?.messageId === interaction.message.id
            });
            await interaction.reply({
                content: '❌ 投票データが見つかりません。再度候補を選択してください。',
                ephemeral: true
            });
            return;
        }
        
        // データベースから投票情報を取得
        console.log('データベースから投票情報を取得中...');
        const poll = await interaction.client.database.getPoll(interaction.message.id);
        
        console.log('取得した投票情報:', poll);
        
        if (!poll) {
            await interaction.reply({
                content: '❌ この投票は見つかりませんでした。',
                ephemeral: true
            });
            return;
        }
        
        // 投票期限チェック
        if (poll.expires_at && new Date() > new Date(poll.expires_at)) {
            await interaction.reply({
                content: '❌ この投票は期限切れです。',
                ephemeral: true
            });
            return;
        }
        
        console.log('選択された候補のインデックスを取得中...');
        // 選択された候補のインデックスを取得
        const selectedIndices = userSelections.selectedOptions.map(optionId => {
            console.log('optionId処理中:', optionId);
            
            // まず、optionIdが "01/15 (月) 18:00" 形式か "2024-01-15_1800" 形式かを判定
            if (optionId.includes('(') && optionId.includes(')')) {
                // "01/15 (月) 18:00" 形式の場合、直接poll.optionsから検索
                const index = poll.options.findIndex(option => option === optionId);
                console.log('直接検索結果:', { optionId, index, option: poll.options[index] });
                return index;
            } else if (optionId.startsWith('option_')) {
                // "option_0" 形式の場合、インデックスを抽出
                const index = parseInt(optionId.replace('option_', ''));
                console.log('インデックス抽出結果:', { optionId, index });
                return index;
            } else {
                // "2024-01-15_1800" 形式の場合、従来の処理
                const dateTime = optionId.split('_');
                const date = dateTime[0]; // "2024-01-15"
                const time = dateTime[1]; // "1800"
                
                // 時間をHH:MM形式に変換
                const hours = time.substring(0, 2);
                const minutes = time.substring(2, 4);
                const timeFormatted = `${hours}:${minutes}`;
                
                // 日付をMM/DD形式に変換
                const momentDate = moment(date);
                const dateFormatted = momentDate.format('MM/DD');
                const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][momentDate.day()];
                
                // 候補文字列を構築
                const candidateText = `${dateFormatted} (${dayOfWeek}) ${timeFormatted}`;
                
                console.log('候補文字列構築:', {
                    optionId,
                    date,
                    time,
                    timeFormatted,
                    dateFormatted,
                    dayOfWeek,
                    candidateText
                });
                
                // poll.optionsから該当するインデックスを検索
                const index = poll.options.findIndex(option => option === candidateText);
                console.log('インデックス検索結果:', { candidateText, index, option: poll.options[index] });
                return index;
            }
        }).filter(index => index !== -1);
        
        console.log('選択されたインデックス:', selectedIndices);
        
        if (selectedIndices.length === 0) {
            await interaction.reply({
                content: '❌ 有効な候補が選択されていません。',
                ephemeral: true
            });
            return;
        }
        
        // 既存の投票を削除してから新しい投票を記録
        console.log('既存の投票を削除中...', { pollId: poll.id, userId: interaction.user.id });
        const deletedCount = await interaction.client.database.deleteUserVotes(poll.id, interaction.user.id);
        console.log('削除された投票数:', deletedCount);
        
        // 各選択肢に投票を記録
        console.log('投票をデータベースに記録中...');
        for (const optionIndex of selectedIndices) {
            console.log('投票記録:', { pollId: poll.id, userId: interaction.user.id, optionIndex });
            await interaction.client.database.addVote(poll.id, interaction.user.id, optionIndex);
        }
        
        // 投票結果を取得
        console.log('投票結果を取得中...');
        const votes = await interaction.client.database.getVotes(poll.id);
        const voteCounts = {};
        
        votes.forEach(vote => {
            if (!voteCounts[vote.option_index]) {
                voteCounts[vote.option_index] = [];
            }
            voteCounts[vote.option_index].push(`<@${vote.user_id}>`);
        });
        
        console.log('投票結果:', voteCounts);
        
        // 投票結果をデータベースに更新
        await interaction.client.database.updatePollVotes(poll.id, voteCounts);
        
        // メッセージを更新（投票結果は非公開）
        console.log('メッセージを更新中...');
        const updatedEmbed = PollUtils.createPollEmbed(poll, {}); // 空の投票結果で表示
        
        // スケジュール投票ではSelectMenuと投票結果確認ボタンの両方を表示
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
        
        // SelectMenuを再作成（新しい人が投票できるように）
        const selectOptions = poll.options.map((option, index) => {
            // optionは "01/15 (月) 18:00" 形式
            // これを "2024-01-15_1800" 形式に変換
            const match = option.match(/(\d{2})\/(\d{2}) \((\w+)\) (\d{2}):(\d{2})/);
            if (match) {
                const [, month, day, dayOfWeek, hours, minutes] = match;
                const date = `2024-${month}-${day}`;
                const time = `${hours}${minutes}`;
                const value = `${date}_${time}`;
                
                console.log('SelectMenu再作成:', {
                    option,
                    value,
                    index
                });
                
                return {
                    label: `${index + 1}. ${option}`,
                    value: value,
                    description: `候補 ${index + 1}`
                };
            } else {
                // フォーマットが予期しない場合は、インデックスベースのIDを使用
                return {
                    label: `${index + 1}. ${option}`,
                    value: `option_${index}`,
                    description: `候補 ${index + 1}`
                };
            }
        });
        
        const selectMenu = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('schedule_multi_select')
                    .setPlaceholder('投票したい候補を選択してください')
                    .setMinValues(1)
                    .setMaxValues(poll.options.length)
                    .addOptions(selectOptions)
            );
        
        // 投票確定・修正・キャンセルボタン
        const voteButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('schedule_confirm_vote')
                    .setLabel('✅ 投票を確定・修正する')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId('schedule_cancel_vote')
                    .setLabel('❌ 投票をキャンセル')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌')
            );
        
        // 投票結果確認ボタン
        const resultButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('schedule_view_results')
                    .setLabel('投票結果を確認')
                    .setStyle(ButtonStyle.Primary)
            );
        
        await interaction.update({
            embeds: [updatedEmbed],
            components: [selectMenu, voteButtons, resultButton]
        });
        
        // セッションデータを削除
        interaction.client.scheduleSelections.delete(interaction.user.id);
        
        await interaction.followUp({
            content: `✅ ${selectedIndices.length}個の候補に投票しました！\n📊 投票結果は「投票結果を確認」ボタンから見ることができます。\n✏️ 投票を修正したい場合は「投票を確定・修正する」ボタンをクリックしてください。`,
            ephemeral: true
        });
        
        console.log('投票確定処理完了');
        
    } catch (error) {
        console.error('スケジュール投票確定エラー:', error);
        console.error('エラーの詳細:', {
            message: error.message,
            stack: error.stack
        });
        await interaction.reply({
            content: '❌ 投票確定中にエラーが発生しました。',
            ephemeral: true
        });
    }
}

// スケジュール投票キャンセルハンドラー
async function handleScheduleCancelVote(interaction) {
    try {
        // セッションデータを削除
        if (interaction.client.scheduleSelections) {
            interaction.client.scheduleSelections.delete(interaction.user.id);
        }
        
        await interaction.reply({
            content: '❌ 投票をキャンセルしました。',
            ephemeral: true
        });
        
    } catch (error) {
        console.error('スケジュール投票キャンセルエラー:', error);
        await interaction.reply({
            content: '❌ 投票キャンセル中にエラーが発生しました。',
            ephemeral: true
        });
    }
}

async function handleScheduleViewResults(interaction) {
    try {
        console.log('投票結果確認処理開始:', { userId: interaction.user.id, messageId: interaction.message.id });
        // すぐにACK
        await interaction.deferReply({ flags: 64 });
        
        // データベースから投票情報を取得
        const poll = await interaction.client.database.getPoll(interaction.message.id);
        if (!poll) {
            await interaction.editReply({ content: '❌ 投票情報が見つかりません。' });
            return;
        }
        
        // 投票結果を取得
        const votes = await interaction.client.database.getVotes(poll.id);
        const voteCounts = {};
        
        votes.forEach(vote => {
            if (!voteCounts[vote.option_index]) {
                voteCounts[vote.option_index] = [];
            }
            voteCounts[vote.option_index].push(`<@${vote.user_id}>`);
        });
        
        console.log('投票結果:', voteCounts);
        
        // 投票結果を表示（非公開）
        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setTitle(`📊 ${poll.title} - 投票結果`)
            .setColor(0x00ff00)
            .setTimestamp();
        
        if (Object.keys(voteCounts).length === 0) {
            embed.setDescription('まだ投票がありません。');
        } else {
            let description = '';
            poll.options.forEach((option, index) => {
                const voters = voteCounts[index] || [];
                const voteCount = voters.length;
                description += `**${option}** - ${voteCount}票\n`;
                if (voters.length > 0) {
                    description += `　👤 ${voters.join(', ')}\n\n`;
                } else {
                    description += '\n';
                }
            });
            embed.setDescription(description);
        }
        
        await interaction.editReply({ embeds: [embed] });
        
        console.log('投票結果確認処理完了');
        
    } catch (error) {
        console.error('スケジュール投票結果確認エラー:', error);
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: '❌ 投票結果の取得中にエラーが発生しました。' });
            } else {
                await interaction.reply({ content: '❌ 投票結果の取得中にエラーが発生しました。', flags: 64 });
            }
        } catch {}
    }
}

// リマインダー関連のハンドラー関数
async function handleRemindPollSelect(interaction) {
    try {
        try { await Interact.safeDeferUpdate(interaction); } catch {}
        console.log('リマインダー投票選択処理開始:', { 
            userId: interaction.user.id, 
            selectedPollId: interaction.values[0] 
        });

        const pollId = parseInt(interaction.values[0]);
        
        // 投票情報を取得
        const poll = await interaction.client.database.getPollById(pollId);
        if (!poll) {
            await interaction.reply({
                content: '❌ 投票情報が見つかりません。',
                ephemeral: true
            });
            return;
        }

        // セッションデータを保存
        if (!interaction.client.remindSessions) {
            interaction.client.remindSessions = new Map();
        }
        
        interaction.client.remindSessions.set(interaction.user.id, {
            pollId: pollId,
            pollTitle: poll.title,
            timestamp: Date.now()
        });

        // 日時選択（投票の各オプション）用SelectMenuを表示
        const selectOptions = poll.options.map((opt, idx) => ({
            label: opt.length > 100 ? opt.substring(0, 97) + '...' : opt,
            value: idx.toString(),
            description: `候補 #${idx + 1}`
        }));

        const dateSelect = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('remind_option_select')
                    .setPlaceholder('リマインド対象の日時を選択してください')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions(selectOptions)
            );

        await Interact.safeUpdate(interaction, { components: [dateSelect] });

        console.log('リマインダー投票選択処理完了（日時選択表示）');

    } catch (error) {
        console.error('リマインダー投票選択エラー:', error);
        try { await Interact.safeFollowUp(interaction, { content: '❌ リマインダー設定中にエラーが発生しました。', flags: 64 }); } catch {}
    }
}

async function handleRemindOptionSelect(interaction) {
    try {
        console.log('リマインダー日時選択処理開始:', {
            userId: interaction.user.id,
            value: interaction.values[0]
        });

        const optionIndex = parseInt(interaction.values[0]);
        const sessionData = interaction.client.remindSessions?.get(interaction.user.id);
        if (!sessionData) {
            await interaction.reply({
                content: '❌ セッションが無効です。再度コマンドを実行してください。',
                ephemeral: true
            });
            return;
        }

        // セッションに日時インデックスを保存
        sessionData.optionIndex = optionIndex;
        interaction.client.remindSessions.set(interaction.user.id, sessionData);

        // リマインダーメッセージ入力用のモーダルを表示
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder()
            .setCustomId('remind_message_modal')
            .setTitle('リマインダーメッセージ入力');

        const messageInput = new TextInputBuilder()
            .setCustomId('remind_message')
            .setLabel('リマインダーメッセージ（任意）')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('例：会議の準備をお願いします')
            .setRequired(false)
            .setMaxLength(1000);

        const row = new ActionRowBuilder().addComponents(messageInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
        console.log('リマインダー日時選択処理完了（モーダル表示）');

    } catch (error) {
        console.error('リマインダー日時選択エラー:', error);
        await interaction.reply({
            content: '❌ リマインダー設定中にエラーが発生しました。',
            ephemeral: true
        });
    }
}

async function handleRemindMessageSubmit(interaction) {
    try {
        console.log('リマインダーメッセージ送信処理開始:', { 
            userId: interaction.user.id 
        });

        // セッションデータを取得
        const sessionData = interaction.client.remindSessions?.get(interaction.user.id);
        if (!sessionData) {
            await interaction.reply({
                content: '❌ セッションが無効です。再度コマンドを実行してください。',
                ephemeral: true
            });
            return;
        }

        const customMessage = interaction.fields.getTextInputValue('remind_message') || 'リマインダーです！';

        // 投票情報を取得
        const poll = await interaction.client.database.getPollById(sessionData.pollId);
        if (!poll) {
            await interaction.reply({
                content: '❌ 投票情報が見つかりません。',
                ephemeral: true
            });
            return;
        }

        // 投票者を取得（選択した日時に投票した人のみ）
        const votes = await interaction.client.database.getVotes(poll.id);
        const targetIndex = sessionData.optionIndex;
        const uniqueVoters = [...new Set(votes.filter(v => v.option_index === targetIndex).map(v => v.user_id))];
        
        if (uniqueVoters.length === 0) {
            await interaction.reply({
                content: '❌ この投票に参加した人がいません。',
                ephemeral: true
            });
            return;
        }

        // 本文テキストを作成（メンション / 日時 / コメント の順）
        const mentionText = uniqueVoters.map(userId => `<@${userId}>`).join(' ');
        // poll.options[targetIndex] は "MM/DD (曜) HH:MM" 形式
        const opt = poll.options[targetIndex] || '';
        let formatted = opt;
        try {
            const match = opt.match(/^(\d{2})\/(\d{2}) .* (\d{2}):(\d{2})$/);
            if (match) {
                const nowYear = moment().year();
                const mm = parseInt(match[1], 10);
                const dd = parseInt(match[2], 10);
                const hh = parseInt(match[3], 10);
                const mi = parseInt(match[4], 10);
                const m = moment.tz({ year: nowYear, month: mm - 1, day: dd, hour: hh, minute: mi }, 'Asia/Tokyo');
                if (m.isValid()) {
                    if (mi === 0) {
                        formatted = `${m.year()}年${m.month() + 1}月${m.date()}日${m.hour()}時`;
                    } else {
                        formatted = `${m.year()}年${m.month() + 1}月${m.date()}日${m.format('H時mm分')}`;
                    }
                }
            }
        } catch {}

        const body = `${mentionText}\n${formatted}\n${customMessage}`.trim();

        await interaction.reply({ content: body });

        // セッションデータを削除
        interaction.client.remindSessions.delete(interaction.user.id);

        console.log('リマインダーメッセージ送信処理完了:', {
            pollId: sessionData.pollId,
            votersCount: uniqueVoters.length
        });

    } catch (error) {
        console.error('リマインダーメッセージ送信エラー:', error);
        await interaction.reply({
            content: '❌ リマインダー送信中にエラーが発生しました。',
            ephemeral: true
        });
    }
}

// ===== 自動リマインド（autoremind）ハンドラー =====
async function handleAutoRemindPollSelect(interaction) {
    try {
        const pollId = parseInt(interaction.values[0]);
        const poll = await interaction.client.database.getPollById(pollId);
        if (!poll) {
            await interaction.reply({ content: '❌ 投票情報が見つかりません。', ephemeral: true });
            return;
        }

        if (!interaction.client.autoremindSessions) {
            interaction.client.autoremindSessions = new Map();
        }
        interaction.client.autoremindSessions.set(interaction.user.id, {
            pollId,
            channelId: interaction.channel.id,
            guildId: interaction.guild.id,
            timestamp: Date.now()
        });

        const modal = new ModalBuilder()
            .setCustomId('autoremind_input_modal')
            .setTitle('自動リマインド設定');

        const datetimeInput = new TextInputBuilder()
            .setCustomId('autoremind_datetime')
            .setLabel('送信日時（YYYY/MM/DD HH:mm, JST）')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('例: 2025/01/15 17:30')
            .setRequired(true);

        const messageInput = new TextInputBuilder()
            .setCustomId('autoremind_message')
            .setLabel('メッセージ（任意）')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('例：会議の準備をお願いします')
            .setRequired(false)
            .setMaxLength(1000);

        const row1 = new ActionRowBuilder().addComponents(datetimeInput);
        const row2 = new ActionRowBuilder().addComponents(messageInput);
        modal.addComponents(row1, row2);

        await interaction.showModal(modal);
    } catch (error) {
        console.error('autoremind投票選択エラー:', error);
        await interaction.reply({ content: '❌ 自動リマインド設定中にエラーが発生しました。', ephemeral: true });
    }
}

async function handleAutoRemindInputSubmit(interaction) {
    try {
        const session = interaction.client.autoremindSessions?.get(interaction.user.id);
        if (!session) {
            await interaction.reply({ content: '❌ セッションが無効です。再度やり直してください。', ephemeral: true });
            return;
        }

        const datetimeStr = interaction.fields.getTextInputValue('autoremind_datetime');
        const message = interaction.fields.getTextInputValue('autoremind_message') || 'リマインダーです！';

        // JSTで解析
        const m = moment.tz(datetimeStr, 'YYYY/MM/DD HH:mm', 'Asia/Tokyo');
        if (!m.isValid()) {
            await interaction.reply({ content: '❌ 日時の形式が不正です。YYYY/MM/DD HH:mm で入力してください。', ephemeral: true });
            return;
        }
        if (m.isBefore(moment.tz('Asia/Tokyo'))) {
            await interaction.reply({ content: '❌ 過去の日時は指定できません。', ephemeral: true });
            return;
        }

        // 永続化 + スケジュール登録
        const remindAtIso = m.toISOString();
        const reminderId = await interaction.client.reminderScheduler.scheduleFromData({
            guildId: session.guildId,
            channelId: session.channelId,
            pollId: session.pollId,
            message,
            remindAt: remindAtIso,
            createdBy: interaction.user.id
        });

        interaction.client.autoremindSessions.delete(interaction.user.id);

        await interaction.reply({
            content: `✅ 自動リマインドを登録しました（ID: ${reminderId}）。\n🗓️ 送信予定: ${m.tz('Asia/Tokyo').format('YYYY/MM/DD HH:mm')} JST`,
            ephemeral: true
        });
    } catch (error) {
        console.error('autoremind入力処理エラー:', error);
        await interaction.reply({ content: '❌ 自動リマインド登録中にエラーが発生しました。', ephemeral: true });
    }
}

// ===== specif 追加ハンドラー =====
async function handleSpecifAddCandidate(interaction) {
    try {
        try { await Interact.safeDeferUpdate(interaction); } catch {}
        if (!interaction.client.specifSessions) interaction.client.specifSessions = new Map();
        const sess = interaction.client.specifSessions.get(interaction.message.id);
        if (!sess || !Array.isArray(sess.selectedDates) || sess.selectedDates.length === 0) {
            await Interact.safeFollowUp(interaction, { content: '❌ 先に日付を1つ以上選択してください。', flags: 64 });
            return;
        }

        const timeSelect = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('specif_time_select')
                .setPlaceholder('時間帯を選択してください（複数選択可）')
                .setMinValues(1)
                .setMaxValues(5)
                .addOptions(
                    { label: '🌅 午前 (9:00-12:00)', value: 'morning', description: '午前中の時間帯' },
                    { label: '☀️ 午後 (13:00-17:00)', value: 'afternoon', description: '午後の時間帯' },
                    { label: '🌙 夜 (18:00-21:00)', value: 'evening', description: '夜の時間帯' },
                    { label: '🌃 深夜 (22:00-24:00)', value: 'night', description: '深夜の時間帯' },
                    { label: '🌄 早朝 (6:00-9:00)', value: 'early', description: '早朝の時間帯' }
                )
        );

        await Interact.safeUpdate(interaction, { components: [timeSelect] });
        try {
            const count = sess.selectedDates?.length || 0;
            await Interact.safeFollowUp(interaction, { content: `✅ 候補に追加しました（${count}日）`, flags: 64 });
        } catch {}
    } catch (e) {
        console.error('specif 候補追加エラー:', e);
        try { await Interact.safeFollowUp(interaction, { content: '❌ 候補追加中にエラーが発生しました。', flags: 64 }); } catch {}
    }
}

async function handleSpecifTimeSelect(interaction) {
    try {
        try { await Interact.safeDeferUpdate(interaction); } catch {}
        if (!interaction.client.specifSessions) interaction.client.specifSessions = new Map();
        const sess = interaction.client.specifSessions.get(interaction.message.id);
        if (!sess || !Array.isArray(sess.selectedDates) || sess.selectedDates.length === 0) {
            await Interact.safeFollowUp(interaction, { content: '❌ 先に日付を選択してください。', flags: 64 });
            return;
        }

        // スロットをそのまま候補化（時間展開しない）
        const slotLabelMap = {
            morning: '午前',
            afternoon: '午後',
            evening: '夜',
            night: '深夜',
            early: '早朝'
        };
        const slots = interaction.values;
        const options = [];
        for (const d of sess.selectedDates) {
            const m = moment.tz(d, 'YYYY-MM-DD', 'Asia/Tokyo');
            const youbi = ['日', '月', '火', '水', '木', '金', '土'][m.day()];
            for (const s of slots) {
                const label = slotLabelMap[s] || s;
                options.push(`${m.format('MM/DD')} (${youbi}) ${label}`);
            }
        }
        sess.selectedTimes = slots;

        sess.candidates = options;
        interaction.client.specifSessions.set(interaction.message.id, sess);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('specif_create_poll').setLabel('投票を作成').setStyle(ButtonStyle.Success).setEmoji('✅')
        );

        await Interact.safeUpdate(interaction, { components: [row] });
        try { await Interact.safeFollowUp(interaction, { content: `✅ 候補を生成: ${options.length}件`, flags: 64 }); } catch {}
    } catch (error) {
        console.error('specif 時間選択エラー:', error);
        try { await Interact.safeFollowUp(interaction, { content: '❌ 時間選択中にエラーが発生しました。', flags: 64 }); } catch {}
    }
}

async function handleSpecifCreatePoll(interaction) {
    try {
        try { await Interact.safeDeferUpdate(interaction); } catch {}
        if (!interaction.client.specifSessions) interaction.client.specifSessions = new Map();
        const sess = interaction.client.specifSessions.get(interaction.message.id);
        if (!sess || !Array.isArray(sess.candidates) || sess.candidates.length === 0) {
            await Interact.safeFollowUp(interaction, { content: '❌ 候補がありません。日付/時間を選択してください。', flags: 64 });
            return;
        }

        const expiresAt = moment().add(24, 'hours').toISOString();

        // まず仮のメッセージを送信（ID取得用、フッターに投票IDは入れない）
        const tempEmbed = new EmbedBuilder()
            .setTitle(`📅 ${sess.title}`)
            .setColor(0x00AE86)
            .addFields({ name: '📋 選択肢', value: PollUtils.formatOptions(sess.candidates), inline: false })
            .setTimestamp();
        if (sess.description && sess.description.length > 0) {
            tempEmbed.setDescription(sess.description);
        }
        if (expiresAt) {
            const expiryTime = moment(expiresAt).tz('Asia/Tokyo');
            tempEmbed.setFooter({ text: `⏰ 投票期限: ${expiryTime.format('YYYY/MM/DD HH:mm')} JST` });
        }
        const buttons = PollUtils.createPollButtons('schedule', sess.candidates);
        const sent = await interaction.channel.send({ embeds: [tempEmbed], components: buttons });

        // メッセージIDを用いてDBに保存
        const pollId = await interaction.client.database.createPoll({
            messageId: sent.id,
            channelId: interaction.channel.id,
            guildId: interaction.guild.id,
            creatorId: interaction.user.id,
            title: sess.title,
            description: sess.description,
            pollType: 'schedule',
            options: sess.candidates,
            expiresAt
        });

        // 投票ID入りの最終Embedで上書き
        const finalText = PollUtils.createPollText({
            id: pollId,
            title: sess.title,
            description: sess.description,
            options: sess.candidates,
            expires_at: expiresAt
        }, {});
        await sent.edit({ content: finalText, embeds: [], components: buttons });

        try { await interaction.message.delete(); } catch {}
        interaction.client.specifSessions.delete(interaction.message.id);

        await Interact.safeFollowUp(interaction, { content: `✅ 投票を作成しました（投票ID: ${pollId}）`, flags: 64 });
    } catch (error) {
        console.error('specif 投票作成エラー:', error);
        try { await Interact.safeFollowUp(interaction, { content: '❌ 投票作成中にエラーが発生しました。', flags: 64 }); } catch {}
    }
}
