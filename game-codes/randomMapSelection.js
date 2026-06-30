/**
 * RANDOMIZED MAP SELECTION SYSTEM WITH PLAYER VOTING
 * 
 * This system provides:
 * - Configurable map pool with easy coordinate changes
 * - Player voting via shop interface
 * - Randomized selection based on voting
 * - Hub location for waiting/losing players
 * - Automatic player teleportation
 * - Vote counting and winner announcement
 */

// ============================================================================
// MAP CONFIGURATION - EASILY CUSTOMIZABLE COORDINATES
// ============================================================================

const MAP_CONFIG = {
  maps: [
    {
      id: "map_forest",
      name: "Forest Arena",
      description: "Dense forest with tight combat",
      icon: "Oak_Leaves",
      spawn: [100, 65, 200],
      bounds: { minX: 80, maxX: 120, minZ: 180, maxZ: 220 }
    },
    {
      id: "map_desert",
      name: "Desert Dunes",
      description: "Open desert with sandstorms",
      icon: "Sand",
      spawn: [300, 70, 150],
      bounds: { minX: 280, maxX: 320, minZ: 130, maxZ: 170 }
    },
    {
      id: "map_snow",
      name: "Frozen Peaks",
      description: "Icy mountain arena",
      icon: "Snow",
      spawn: [-200, 100, 0],
      bounds: { minX: -220, maxX: -180, minZ: -20, maxZ: 20 }
    },
    {
      id: "map_nether",
      name: "Nether Fortress",
      description: "Dangerous fortress with lava",
      icon: "Netherrack",
      spawn: [0, 65, -300],
      bounds: { minX: -30, maxX: 30, minZ: -330, maxZ: -270 }
    },
    {
      id: "map_sky",
      name: "Sky Platforms",
      description: "Floating islands battle",
      icon: "Obsidian",
      spawn: [500, 120, 500],
      bounds: { minX: 470, maxX: 530, minZ: 470, maxZ: 530 }
    }
  ],
  
  // Hub location where players wait and respawn
  hub: {
    spawn: [0, 65, 0],
    name: "Main Hub",
    description: "Waiting area"
  },

  // Voting settings
  voting: {
    duration: 15000, // 15 seconds to vote
    minPlayersToStart: 1,
    maxVotesPerPlayer: 1,
    votingCategory: "maps_vote"
  }
};

// ============================================================================
// VOTING SYSTEM
// ============================================================================

class MapVotingSystem {
  constructor() {
    this.votes = {}; // { playerId: "map_id" }
    this.isVotingActive = false;
    this.votingStartTime = null;
    this.selectedMap = null;
  }

  /**
   * Start the voting process for all connected players
   */
  startVoting() {
    if (this.isVotingActive) return;
    
    this.isVotingActive = true;
    this.votes = {};
    this.votingStartTime = api.now();
    this.selectedMap = null;

    const playerIds = api.getPlayerIds();
    
    playerIds.forEach(playerId => {
      this.setupVotingShop(playerId);
    });

    api.broadcastMessage("Map voting started! Vote for your preferred arena.", {
      color: "yellow"
    });

    // Auto-end voting after timer
    this.votingTimer = setInterval(() => {
      if (api.now() - this.votingStartTime >= MAP_CONFIG.voting.duration) {
        this.endVoting();
        clearInterval(this.votingTimer);
      }
    }, 100);
  }

  /**
   * Setup the voting shop interface for a player
   */
  setupVotingShop(playerId) {
    const categoryKey = MAP_CONFIG.voting.votingCategory;

    // Configure category
    api.configureShopCategoryForPlayer(playerId, categoryKey, {
      customTitle: "MAP VOTING",
      autoSelectCategory: true
    });

    // Create voting items for each map
    MAP_CONFIG.maps.forEach((map, index) => {
      const item = {
        image: map.icon,
        customTitle: map.name,
        description: map.description,
        isSelected: false,
        buyButtonText: "VOTE",
        canBuy: true,
        sortPriority: 100 - index
      };

      api.createShopItemForPlayer(
        playerId,
        categoryKey,
        map.id,
        item
      );
    });
  }

  /**
   * Record a player's vote (called from game callbacks)
   */
  recordVote(playerId, mapId) {
    if (!this.isVotingActive) return false;
    
    if (MAP_CONFIG.maps.find(m => m.id === mapId)) {
      this.votes[playerId] = mapId;
      
      const mapName = MAP_CONFIG.maps.find(m => m.id === mapId).name;
      api.sendMessage(playerId, `You voted for ${mapName}!`, {
        color: "green"
      });
      
      return true;
    }
    
    return false;
  }

  /**
   * End voting and select winning map
   */
  endVoting() {
    this.isVotingActive = false;
    
    if (Object.keys(this.votes).length === 0) {
      // No votes, pick random map
      this.selectedMap = MAP_CONFIG.maps[
        Math.floor(Math.random() * MAP_CONFIG.maps.length)
      ];
    } else {
      // Count votes and find winner
      const voteCounts = {};
      
      Object.values(this.votes).forEach(mapId => {
        voteCounts[mapId] = (voteCounts[mapId] || 0) + 1;
      });

      // Get map with most votes (random tiebreaker)
      const maxVotes = Math.max(...Object.values(voteCounts));
      const topMaps = Object.entries(voteCounts)
        .filter(([_, count]) => count === maxVotes)
        .map(([mapId, _]) => mapId);

      const winningMapId = topMaps[
        Math.floor(Math.random() * topMaps.length)
      ];

      this.selectedMap = MAP_CONFIG.maps.find(m => m.id === winningMapId);
    }

    // Announce winner
    api.broadcastMessage(
      `Map selected: ${this.selectedMap.name}!`,
      { color: "gold" }
    );

    // Clear voting shop for all players
    const playerIds = api.getPlayerIds();
    playerIds.forEach(playerId => {
      // Delete all voting items
      MAP_CONFIG.maps.forEach(map => {
        try {
          api.deleteShopItem(MAP_CONFIG.voting.votingCategory, map.id);
        } catch (e) {
          // Item might not exist for this player
        }
      });
    });

    return this.selectedMap;
  }

  /**
   * Get the currently selected map
   */
  getSelectedMap() {
    return this.selectedMap;
  }

  /**
   * Get vote statistics
   */
  getVoteStats() {
    const stats = {};
    
    Object.values(this.votes).forEach(mapId => {
      stats[mapId] = (stats[mapId] || 0) + 1;
    });

    return Object.entries(stats).map(([mapId, voteCount]) => ({
      map: MAP_CONFIG.maps.find(m => m.id === mapId),
      votes: voteCount
    }));
  }
}

// ============================================================================
// MAP MANAGEMENT SYSTEM
// ============================================================================

class MapManager {
  constructor() {
    this.currentMap = null;
    this.activePlayers = new Set();
    this.playersInLobby = new Set();
  }

  /**
   * Teleport player to a specific map
   */
  teleportToMap(playerId, mapId) {
    const map = MAP_CONFIG.maps.find(m => m.id === mapId);
    if (!map) {
      api.sendMessage(playerId, "Map not found!", { color: "red" });
      return false;
    }

    const [x, y, z] = map.spawn;
    api.setPosition(playerId, x, y, z);
    
    this.currentMap = mapId;
    this.activePlayers.add(playerId);
    this.playersInLobby.delete(playerId);

    api.sendMessage(playerId, `Teleported to ${map.name}!`, {
      color: "green"
    });

    return true;
  }

  /**
   * Teleport player to hub when they lose or disconnect
   */
  teleportToHub(playerId) {
    const [x, y, z] = MAP_CONFIG.hub.spawn;
    api.setPosition(playerId, x, y, z);

    this.activePlayers.delete(playerId);
    this.playersInLobby.add(playerId);

    api.sendMessage(playerId, "Returned to hub. Waiting for next round...", {
      color: "yellow"
    });
  }

  /**
   * Get all players in the current map
   */
  getActivePlayers() {
    return Array.from(this.activePlayers);
  }

  /**
   * Get all players waiting in hub
   */
  getWaitingPlayers() {
    return Array.from(this.playersInLobby);
  }

  /**
   * Get map info
   */
  getMapInfo(mapId) {
    return MAP_CONFIG.maps.find(m => m.id === mapId);
  }

  /**
   * Check if position is within map bounds
   */
  isPositionInMapBounds(mapId, x, y, z) {
    const map = MAP_CONFIG.maps.find(m => m.id === mapId);
    if (!map) return false;

    return (
      x >= map.bounds.minX && x <= map.bounds.maxX &&
      z >= map.bounds.minZ && z <= map.bounds.maxZ
    );
  }

  /**
   * Get closest map to player position
   */
  getClosestMap(playerId) {
    const pos = api.getPosition(playerId);
    if (!pos) return null;

    let closest = null;
    let minDistance = Infinity;

    MAP_CONFIG.maps.forEach(map => {
      const [mx, my, mz] = map.spawn;
      const [px, py, pz] = pos;
      
      const distance = Math.sqrt(
        (mx - px) ** 2 + (my - py) ** 2 + (mz - pz) ** 2
      );

      if (distance < minDistance) {
        minDistance = distance;
        closest = map;
      }
    });

    return closest;
  }
}

// ============================================================================
// GAME STATE MANAGER
// ============================================================================

class GameStateManager {
  constructor(votingSystem, mapManager) {
    this.votingSystem = votingSystem;
    this.mapManager = mapManager;
    this.gameState = "waiting"; // waiting, voting, playing, ended
    this.roundNumber = 0;
  }

  /**
   * Start a new game round
   */
  async startNewRound() {
    this.roundNumber++;
    this.gameState = "voting";

    // Teleport all players to hub
    const allPlayers = api.getPlayerIds();
    allPlayers.forEach(playerId => {
      this.mapManager.teleportToHub(playerId);
    });

    // Start voting
    this.votingSystem.startVoting();

    // Wait for voting to end
    await this.waitForVotingEnd();

    // Get selected map
    const selectedMap = this.votingSystem.getSelectedMap();
    if (!selectedMap) {
      api.broadcastMessage("Error selecting map. Retrying...", {
        color: "red"
      });
      return this.startNewRound();
    }

    // Teleport players to the selected map
    this.gameState = "playing";
    allPlayers.forEach(playerId => {
      this.mapManager.teleportToMap(playerId, selectedMap.id);
    });

    api.broadcastMessage(`Round ${this.roundNumber} started on ${selectedMap.name}!`, {
      color: "gold"
    });
  }

  /**
   * Wait for voting to complete
   */
  async waitForVotingEnd() {
    return new Promise(resolve => {
      const checkInterval = setInterval(() => {
        if (!this.votingSystem.isVotingActive) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Handle player elimination
   */
  handlePlayerEliminated(playerId) {
    this.mapManager.teleportToHub(playerId);
    
    const winner = this.mapManager.getActivePlayers();
    if (winner.length === 1) {
      this.endRound(winner[0]);
    }
  }

  /**
   * End the current round
   */
  endRound(winnerId) {
    this.gameState = "ended";

    const winnerName = api.getName(winnerId) || `Player ${winnerId}`;
    api.broadcastMessage(`${winnerName} wins! Next round starting...`, {
      color: "green"
    });

    // Schedule next round after delay
    setTimeout(() => {
      this.startNewRound();
    }, 5000);
  }

  /**
   * Get current game state
   */
  getState() {
    return {
      state: this.gameState,
      round: this.roundNumber,
      currentMap: this.mapManager.currentMap,
      activePlayers: this.mapManager.getActivePlayers(),
      waitingPlayers: this.mapManager.getWaitingPlayers()
    };
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Create system instances
const votingSystem = new MapVotingSystem();
const mapManager = new MapManager();
const gameStateManager = new GameStateManager(votingSystem, mapManager);

// Initialize players in hub on startup
api.getPlayerIds().forEach(playerId => {
  mapManager.teleportToHub(playerId);
});

// Start first round
gameStateManager.startNewRound();

// ============================================================================
// GAME CALLBACKS & EVENT HANDLERS
// ============================================================================

/**
 * Handle shop purchases (voting)
 * Add this to your onPlayerBuyShopItem callback:
 * 
 * if (itemCategoryKey === MAP_CONFIG.voting.votingCategory) {
 *   votingSystem.recordVote(playerId, itemKey);
 * }
 */

/**
 * Handle player death/elimination
 * Add this to your onPlayerDied callback:
 * 
 * gameStateManager.handlePlayerEliminated(playerId);
 */

/**
 * Handle new player joining
 * Add this to your onPlayerJoin callback:
 * 
 * mapManager.teleportToHub(playerId);
 * if (votingSystem.isVotingActive) {
 *   votingSystem.setupVotingShop(playerId);
 * }
 */

/**
 * Handle player leaving map bounds (void/out of bounds)
 * Add this to check during game loop:
 * 
 * const activePlayers = mapManager.getActivePlayers();
 * const currentMap = gameStateManager.gameState.currentMap;
 * 
 * activePlayers.forEach(playerId => {
 *   const pos = api.getPosition(playerId);
 *   const [x, y, z] = pos;
 *   
 *   if (!mapManager.isPositionInMapBounds(currentMap, x, y, z)) {
 *     gameStateManager.handlePlayerEliminated(playerId);
 *   }
 * });
 */

// ============================================================================
// UTILITY FUNCTIONS (CAN BE CALLED FROM COMMANDS)
// ============================================================================

/**
 * Get current game info
 */
function getGameInfo() {
  const state = gameStateManager.getState();
  const voteStats = votingSystem.getVoteStats();

  api.log("=== GAME STATE ===");
  api.log("State:", state.state);
  api.log("Round:", state.round);
  api.log("Current Map:", state.currentMap);
  api.log("Active Players:", state.activePlayers.length);
  api.log("Waiting Players:", state.waitingPlayers.length);
  
  if (voteStats.length > 0) {
    api.log("\n=== VOTE COUNTS ===");
    voteStats.forEach(stat => {
      api.log(`${stat.map.name}: ${stat.votes} votes`);
    });
  }
}

/**
 * Force start a new round
 */
function forceNewRound() {
  gameStateManager.startNewRound();
}

/**
 * End voting early
 */
function forceEndVoting() {
  votingSystem.endVoting();
}

/**
 * Teleport player to specific map (for testing)
 */
function teleportPlayerToMap(playerId, mapIndex) {
  const map = MAP_CONFIG.maps[mapIndex];
  if (map) {
    mapManager.teleportToMap(playerId, map.id);
  }
}

/**
 * Teleport all players to hub
 */
function sendAllToHub() {
  api.getPlayerIds().forEach(playerId => {
    mapManager.teleportToHub(playerId);
  });
}

/**
 * Print map configuration
 */
function printMaps() {
  api.log("=== AVAILABLE MAPS ===");
  MAP_CONFIG.maps.forEach((map, i) => {
    api.log(`\n[${i}] ${map.name}`);
    api.log(`    Description: ${map.description}`);
    api.log(`    Spawn: [${map.spawn.join(", ")}]`);
    api.log(`    Bounds: X[${map.bounds.minX}-${map.bounds.maxX}] Z[${map.bounds.minZ}-${map.bounds.maxZ}]`);
  });
  
  api.log("\n=== HUB ===");
  api.log(`Spawn: [${MAP_CONFIG.hub.spawn.join(", ")}]`);
}
