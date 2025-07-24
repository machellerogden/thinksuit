module.exports = {
    content: [
        './src/**/*.{html,js,svelte}',
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                serif: ['Merriweather', 'Georgia', 'serif'],
                mono: ['"Roboto Mono"', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
            },
        },
    },
    plugins: []
};