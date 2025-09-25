module.exports = {
    apps: [
        {
            name: 'discord-schedule-bot',
            script: 'index.js',
            instances: 1,
            exec_mode: 'fork',
            watch: false,
            env: {
                NODE_ENV: 'production'
            }
        }
    ]
};


