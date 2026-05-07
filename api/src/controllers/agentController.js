const Agent = require('../models/Agent');

const agentController = {
  // GET /api/v1/agent/version
  getVersion: async (req, res) => {
    try {
      const version = '1.0.0';
      const minimumSupportedVersion = '1.0.0';
      const downloadUrl = 'https://rhv-dms-backend.vercel.app/api/v1/scanner/auto-install-download';

      res.json({
        success: true,
        data: {
          version,
          minimumSupportedVersion,
          downloadUrl
        }
      });
    } catch (error) {
      console.error('Error in getVersion:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get version information'
      });
    }
  },

  // POST /api/v1/agent/register
  registerAgent: async (req, res) => {
    try {
      const {
        machineId,
        machineName,
        hostname,
        os,
        osVersion,
        agentVersion,
        userId,
        department
      } = req.body;

      // Validate required fields
      const requiredFields = ['machineId', 'machineName', 'hostname', 'os', 'osVersion', 'agentVersion', 'userId', 'department'];
      const missingFields = requiredFields.filter(field => !req.body[field]);

      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`
        });
      }

      // Check if agent already exists
      const existingAgent = await Agent.findOne({ machineId });

      if (existingAgent) {
        // Update existing agent
        existingAgent.machineName = machineName;
        existingAgent.hostname = hostname;
        existingAgent.os = os;
        existingAgent.osVersion = osVersion;
        existingAgent.agentVersion = agentVersion;
        existingAgent.userId = userId;
        existingAgent.department = department;
        existingAgent.onlineStatus = 'online';
        existingAgent.lastActive = new Date();

        await existingAgent.save();

        return res.json({
          success: true,
          message: 'Agent registration updated successfully',
          data: existingAgent
        });
      }

      // Create new agent
      const agent = new Agent({
        machineId,
        machineName,
        hostname,
        os,
        osVersion,
        agentVersion,
        userId,
        department,
        installationStatus: 'installed',
        onlineStatus: 'online'
      });

      await agent.save();

      res.status(201).json({
        success: true,
        message: 'Agent registered successfully',
        data: agent
      });
    } catch (error) {
      console.error('Error in registerAgent:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to register agent'
      });
    }
  }
};

module.exports = agentController;