// bot.js - Version Finale Corrigée et Robuste

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs/promises');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const { SERVER_URL, ADMIN_SECRET_KEY, SUPPORT_ROLE_NAME } = process.env;
const MAX_DEVICES = 2;

// Fonction de communication avec le serveur, incluant des logs de débogage
async function fetchAdmin(endpoint, options = {}) {
    const url = `${SERVER_URL}${endpoint}`;
    console.log(`[DEBUG] Tentative d'appel API vers: ${url}`); // LOG 1: URL Cible

    const headers = {
        'Content-Type': 'application/json',
        'x-admin-key': ADMIN_SECRET_KEY,
        ...options.headers,
    };

    try {
        const response = await fetch(url, { ...options, headers });
        console.log(`[DEBUG] Réponse reçue du serveur avec le statut: ${response.status}`); // LOG 2: Statut de la réponse

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            console.log('[DEBUG] Réponse JSON parsée avec succès.'); // LOG 3: Succès JSON
            return { ok: response.ok, status: response.status, data: data };
        } else {
            const errorText = await response.text();
            console.error(`[DEBUG] La réponse n'est PAS du JSON. Contenu:`, errorText.substring(0, 500)); // LOG 4: Erreur non-JSON
            return { ok: false, status: response.status, data: { error: `Erreur serveur: ${response.statusText}`, details: errorText.substring(0, 200) } };
        }
    } catch (error) {
        console.error("[DEBUG] L'appel API a échoué. Erreur CATCH:", error); // LOG 5: Erreur de connexion
        return { ok: false, status: 503, data: { error: "Impossible de contacter le serveur. L'appel a échoué.", details: error.message } };
    }
}

client.once('ready', () => {
    console.log(`🤖 Connecté en tant que ${client.user.tag} !`);
});

client.on('interactionCreate', async interaction => {
    // --- CORRECTION CRUCIALE : GESTION DES MESSAGES PRIVÉS ---
    // Si l'interaction n'est pas une commande slash ou si elle n'a pas lieu dans un serveur (guilde), on arrête tout.
    if (!interaction.isChatInputCommand() || !interaction.inGuild()) {
        if (interaction.isChatInputCommand()) {
            await interaction.reply({ content: '⛔ Cette commande doit être utilisée dans un serveur, pas en message privé.', ephemeral: true });
        }
        return;
    }
    // --- FIN DE LA CORRECTION ---

    const { commandName } = interaction;

    if (commandName === 'generatekey') {
        // Vérification du rôle autorisé à générer une clé
        let config;
        try {
            config = JSON.parse(await fs.readFile('./config.json', 'utf8'));
        } catch (e) {
            console.error("Erreur de lecture du fichier config.json:", e);
            return interaction.reply({ content: 'Erreur de configuration interne. Contactez un administrateur.', ephemeral: true });
        }

        if (config.allowedRoleId && !interaction.member.roles.cache.has(config.allowedRoleId)) {
            return interaction.reply({
                content: `⛔ Vous n'avez pas le rôle <@&${config.allowedRoleId}> requis pour utiliser cette commande.`,
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });
        const discordUser = interaction.user;

        try {
            // Logique de génération de clé en 2 étapes pour plus de fiabilité
            const listResponse = await fetchAdmin('/admin/list');
            if (!listResponse.ok) throw new Error(listResponse.data.error || "Impossible de vérifier la liste des clés.");
            
            const existingKey = listResponse.data.find(k => k.discord_user_id === discordUser.id);
            if (existingKey) {
                const embed = new EmbedBuilder().setColor('#ffc107').setTitle('⚠️ Vous avez déjà une clé !').addFields({ name: 'Votre Clé', value: `\`\`\`${existingKey.cle_unique}\`\`\`` });
                return interaction.editReply({ embeds: [embed] });
            }

            const addResponse = await fetchAdmin('/admin/add', { method: 'POST' });
            if (!addResponse.ok) throw new Error(addResponse.data.error || "Erreur lors de la création de la clé.");
            
            const nouvelleCle = addResponse.data.key;

            const linkResponse = await fetchAdmin('/admin/link', {
                method: 'POST',
                body: JSON.stringify({
                    key: nouvelleCle,
                    discordUserId: discordUser.id,
                    discordUsername: discordUser.tag
                })
            });
            if (!linkResponse.ok) throw new Error(linkResponse.data.error || "Erreur lors du liage de la clé.");

            const embed = new EmbedBuilder().setColor('#28a745').setTitle('✅ Votre Clé a été générée !').addFields({ name: 'Votre Clé', value: `\`\`\`${nouvelleCle}\`\`\`` });
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `❌ Une erreur est survenue : ${error.message}` });
        }
    }

    if (commandName === 'admin') {
        const hasRole = interaction.member.roles.cache.some(role => role.name === SUPPORT_ROLE_NAME);
        if (!hasRole) {
            return interaction.reply({ content: '⛔ Vous n\'avez pas la permission d\'utiliser cette commande.', ephemeral: true });
        }

        const subCommand = interaction.options.getSubcommand();
        await interaction.deferReply({ ephemeral: true });

        try {
            if (subCommand === 'listkeys') {
                const response = await fetchAdmin('/admin/list');
                if (!response.ok) throw new Error('Impossible de récupérer la liste des clés.');
                const keys = response.data;
                if (keys.length === 0) return interaction.editReply('Aucune clé n\'a été générée.');
                
                let description = keys.map(k =>
                    `**Clé**: \`${k.cle_unique}\`\n` +
                    `**Utilisateur**: ${k.discord_username || 'Non lié'} (<@${k.discord_user_id || 'N/A'}>)\n` +
                    `**Appareils**: ${JSON.parse(k.appareils_actifs || '[]').length} / ${MAX_DEVICES}`
                ).join('\n\n');

                const embed = new EmbedBuilder().setTitle(`🔑 Liste des Clés Propulse (${keys.length})`).setColor('#0d6efd').setDescription(description);
                await interaction.editReply({ embeds: [embed] });
            }

            if (subCommand === 'resetdevices') {
                const keyToReset = interaction.options.getString('key');
                const response = await fetchAdmin('/admin/reset_devices', {
                    method: 'POST',
                    body: JSON.stringify({ key: keyToReset }),
                });
                if (response.ok) {
                     await interaction.editReply(`✅ Les appareils pour la clé \`${keyToReset}\` ont été réinitialisés.`);
                } else {
                    throw new Error(response.data.error || 'Clé non trouvée ou erreur serveur.');
                }
            }
            
            if (subCommand === 'setrole') {
                const role = interaction.options.getRole('role');
                try {
                    await fs.writeFile('./config.json', JSON.stringify({ allowedRoleId: role.id }));
                    await interaction.editReply(`✅ Parfait ! Seuls les membres avec le rôle **${role.name}** peuvent désormais utiliser \`/generatekey\`.`);
                } catch (e) {
                    console.error("Erreur d'écriture dans config.json:", e);
                    throw new Error("Impossible de sauvegarder la configuration.");
                }
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply(`❌ Une erreur est survenue : ${error.message}`);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);