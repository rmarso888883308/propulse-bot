// deploy-commands.js - Fichier mis à jour

require('dotenv').config();
const { REST, Routes } = require('discord.js');

const commands = [
    {
        name: 'generatekey',
        description: 'Génère votre clé de licence unique Propulse.',
    },
    {
        name: 'admin',
        description: 'Commandes réservées au staff.',
        options: [
            // ... (les sous-commandes listkeys et resetdevices restent ici)
            {
                name: 'listkeys',
                description: 'Affiche toutes les clés de licence et leurs utilisateurs.',
                type: 1, // SUB_COMMAND
            },
            {
                name: 'resetdevices',
                description: 'Réinitialise les appareils pour une clé de licence.',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'key',
                        type: 3, // STRING
                        description: 'La clé à réinitialiser (ex: PROPULSE-...).',
                        required: true,
                    },
                ],
            },
            // NOUVELLE SOUS-COMMANDE
            {
                name: 'setrole',
                description: 'Définit le rôle autorisé à utiliser /generatekey.',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'role',
                        type: 8, // ROLE
                        description: 'Le rôle qui pourra générer des clés.',
                        required: true,
                    },
                ],
            },
        ],
    },
];

// ... (le reste du fichier ne change pas)
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
    try {
        console.log('Début du rafraîchissement des commandes (/) de l\'application.');
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );
        console.log('Commandes (/) de l\'application rechargées avec succès.');
    } catch (error) {
        console.error(error);
    }
})();