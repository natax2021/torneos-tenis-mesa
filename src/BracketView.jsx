import './bracket.css';

export default function BracketView({ matches, players, onMatchClick }) {
  const getPlayerName = (playerId) => {
    if (!playerId) return 'BYE';
    const player = players.find(p => p.id === playerId);
    return player ? player.name : 'Desconocido';
  };

  // Agrupar partidos por ronda
  const rounds = {};
  matches.forEach(match => {
    if (!rounds[match.round]) rounds[match.round] = [];
    rounds[match.round].push(match);
  });

  const roundNames = Object.keys(rounds).sort();

  return (
    <div className="bracket-container">
      <div className="bracket-scroll">
        {roundNames.map((roundName, roundIndex) => (
          <div key={roundName} className="bracket-round">
            <h3 className="round-title">{roundName}</h3>
            <div className="round-matches">
              {rounds[roundName].map((match) => {
                const p1Name = getPlayerName(match.player1_id);
                const p2Name = getPlayerName(match.player2_id);
                const isCompleted = match.status === 'completed';
                const p1Won = isCompleted && match.winner_id === match.player1_id;
                const p2Won = isCompleted && match.winner_id === match.player2_id;

                return (
                  <div 
                    key={match.id} 
                    className={`match-card ${isCompleted ? 'completed' : 'pending'}`}
                    onClick={() => onMatchClick && onMatchClick(match)}
                  >
                    <div className={`team ${p1Won ? 'winner' : ''} ${!match.player1_id ? 'bye' : ''}`}>
                      <span className="team-name">{p1Name}</span>
                      {isCompleted && <span className="team-score">{p1Won ? '✓' : ''}</span>}
                    </div>
                    <div className={`team ${p2Won ? 'winner' : ''} ${!match.player2_id ? 'bye' : ''}`}>
                      <span className="team-name">{p2Name}</span>
                      {isCompleted && <span className="team-score">{p2Won ? '✓' : ''}</span>}
                    </div>
                    <div className="match-info">
                      Mesa {match.table_number}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}