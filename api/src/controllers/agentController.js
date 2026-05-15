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
  },

  // GET /api/v1/scanner/health
  getAgentHealth: async (req, res) => {
    try {
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      // Find user's agent information
      const agent = await Agent.findOne({ userId }).sort({ lastActive: -1 });

      if (!agent) {
        return res.json({
          success: true,
          data: {
            connected: false,
            machineName: null,
            lastSeen: null
          }
        });
      }

      // Check if agent is still considered connected (within last 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const isConnected = agent.lastActive > fiveMinutesAgo && agent.onlineStatus === 'online';

      res.json({
        success: true,
        data: {
          connected: isConnected,
          machineName: agent.machineName,
          lastSeen: agent.lastActive?.toISOString() || null
        }
      });
    } catch (error) {
      console.error('Error in getAgentHealth:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get agent health'
      });
    }
  },

  // POST /api/v1/scanner/heartbeat
  heartbeat: async (req, res) => {
    try {
      const { machineId, machineName, agentVersion } = req.body;

      if (!machineId) {
        return res.status(400).json({
          success: false,
          message: 'Machine ID is required'
        });
      }

      // Find and update agent heartbeat
      const agent = await Agent.findOne({ machineId });

      if (!agent) {
        return res.status(404).json({
          success: false,
          message: 'Agent not found. Please register the agent first.'
        });
      }

      // Update heartbeat information
      agent.lastActive = new Date();
      agent.onlineStatus = 'online';

      if (machineName) agent.machineName = machineName;
      if (agentVersion) agent.agentVersion = agentVersion;

      await agent.save();

      // Also update user agent connection status
      if (agent.userId) {
        const User = require('../models/User');
        await User.findByIdAndUpdate(agent.userId, {
          lastAgentHeartbeat: new Date(),
          machineName: agent.machineName,
          agentVersion: agent.agentVersion,
          agentConnected: true
        });
      }

      res.json({
        success: true,
        message: 'Heartbeat received',
        data: {
          timestamp: agent.lastActive.toISOString(),
          machineName: agent.machineName,
          agentVersion: agent.agentVersion
        }
      });
    } catch (error) {
      console.error('Error in heartbeat:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process heartbeat'
      });
    }
  }
};

module.exports = agentController;