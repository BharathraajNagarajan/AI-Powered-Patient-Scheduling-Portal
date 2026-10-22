module.exports = {
  apps: [
    {
      name: "ai-patient-scheduling-portal",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
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
        PORT: 3000,
      },
    },
  ],
};
