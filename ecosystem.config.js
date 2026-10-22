module.exports = {
  apps: [
    {
      name: "ai-patient-scheduling-portal",
      script: "scripts/start.js",
      cwd: __dirname,
      exec_mode: "cluster",
      instances: "max",
      max_memory_restart: "400M",
      time: true,
      merge_logs: true,
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      env_production: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: 3000,
      },
    },
  ],
};
