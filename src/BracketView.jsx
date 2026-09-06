import './bracket.css';

export default function BracketView({ matches, players, onMatchClick }) {
  const getPlayerName = (playerId) => {
    if (!playerId) return 'Por definir';
    const player = players.find(p => p.id === playerId);
    return player ? player.name : 'Desconocido';
  };

  // Agrupar partidos por round_number
  const rounds = {};
  matches.forEach(match => {
    const roundNum = match.round_number || 1;
    if (!rounds[roundNum]) rounds[roundNum] = [];
    rounds[roundNum].push(match);
  });

  const roundNumbers = Object.keys(rounds).map(Number).sort((a, b) => a - b);

  return (
    <div className="bracket-container">
      <div className="bracket-scroll">
        {roundNumbers.map((roundNum) => {
          const roundMatches = rounds[roundNum];
          const roundName = roundMatches[0]?.round || `Ronda ${roundNum}`;

          return (
            <div key={roundNum} className="bracket-round">
              <h3 className="round-title">{roundName}</h3>
              <div className="round-matches">
                {roundMatches.map((match) => {
                  const p1Name = getPlayerName(match.player1_id);
                  const p2Name = getPlayerName(match.player2_id);
                  const isCompleted = match.status === 'completed';
                  const p1Won = isCompleted && match.winner_id === match.player1_id;
                  const p2Won = isCompleted && match.winner_id === match.player2_id;
                  const hasBye = !match.player1_id || !match.player2_id;

                  return (
                    <div 
                      key={match.id} 
                      className={`match-card ${isCompleted ? 'completed' : 'pending'} ${hasBye ? 'bye-match' : ''}`}
                      onClick={() => onMatchClick && onMatchClick(match)}
                    >
                      <div className={`team ${p1Won ? 'winner' : ''} ${!match.player1_id ? 'empty' : ''}`}>
                        <span className="team-name">{p1Name}</span>
                        {isCompleted && <span className="team-score">{p1Won ? '✓' : ''}</span>}
                      </div>
                      <div className={`team ${p2Won ? 'winner' : ''} ${!match.player2_id ? 'empty' : ''}`}>
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
          );
        })}
      </div>
    </div>
  );
}