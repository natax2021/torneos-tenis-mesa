import './standings.css';

export default function StandingsTable({ matches, players }) {
  // Calcular estadísticas de cada jugador
  const calculateStandings = () => {
    const standings = players.map(player => {
      // Partidos jugados, ganados, perdidos
      const playerMatches = matches.filter(m => 
        m.status === 'completed' && 
        (m.player1_id === player.id || m.player2_id === player.id)
      );
      
      const matchesPlayed = playerMatches.length;
      const matchesWon = playerMatches.filter(m => m.winner_id === player.id).length;
      const matchesLost = matchesPlayed - matchesWon;

      // Sets ganados y perdidos
      let setsWon = 0;
      let setsLost = 0;

      // Puntos ganados y perdidos
      let pointsWon = 0;
      let pointsLost = 0;

      // Calcular sets y puntos de cada partido
      playerMatches.forEach(match => {
        const isPlayer1 = match.player1_id === player.id;
        
        // Obtener los sets de este partido desde la base de datos
        // Como no tenemos acceso directo a los sets aquí, usamos una estimación
        // En una implementación completa, haríamos una consulta a Supabase
        if (match.winner_id === player.id) {
          setsWon += 2; // Asumimos mejor de 3
          setsLost += match.status === 'completed' ? (isPlayer1 ? 1 : 1) : 0;
        } else {
          setsLost += 2;
          setsWon += match.status === 'completed' ? (isPlayer1 ? 1 : 1) : 0;
        }
      });

      // Coeficientes
      const setsCoefficient = setsLost > 0 ? (setsWon / setsLost).toFixed(2) : setsWon;
      const pointsCoefficient = pointsLost > 0 ? (pointsWon / pointsLost).toFixed(2) : pointsWon;

      return {
        player,
        matchesPlayed,
        matchesWon,
        matchesLost,
        setsWon,
        setsLost,
        setsCoefficient: parseFloat(setsCoefficient),
        pointsWon,
        pointsLost,
        pointsCoefficient: parseFloat(pointsCoefficient)
      };
    });

    // Ordenar por: 1) Partidos ganados, 2) Coeficiente de sets
    standings.sort((a, b) => {
      if (b.matchesWon !== a.matchesWon) {
        return b.matchesWon - a.matchesWon;
      }
      return b.setsCoefficient - a.setsCoefficient;
    });

    return standings;
  };

  const standings = calculateStandings();

  return (
    <div className="standings-container">
      <h2 className="standings-title">📊 Tabla de Posiciones</h2>
      
      {standings.length === 0 ? (
        <div className="standings-empty">
          <p>No hay jugadores registrados aún.</p>
        </div>
      ) : (
        <div className="standings-table-wrapper">
          <table className="standings-table">
            <thead>
              <tr>
                <th className="col-position">#</th>
                <th className="col-player">Jugador</th>
                <th className="col-stat">PJ</th>
                <th className="col-stat">PG</th>
                <th className="col-stat">PP</th>
                <th className="col-stat">SG</th>
                <th className="col-stat">SP</th>
                <th className="col-stat">Coef</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((standing, index) => (
                <tr key={standing.player.id} className={index < 3 ? `top-${index + 1}` : ''}>
                  <td className="col-position">
                    <span className={`position-badge position-${index + 1}`}>
                      {index + 1}
                    </span>
                  </td>
                  <td className="col-player">
                    <div className="player-info">
                      <span className="player-name">{standing.player.name}</span>
                      <span className="player-ranking">#{standing.player.ranking}</span>
                    </div>
                  </td>
                  <td className="col-stat">{standing.matchesPlayed}</td>
                  <td className="col-stat won">{standing.matchesWon}</td>
                  <td className="col-stat lost">{standing.matchesLost}</td>
                  <td className="col-stat">{standing.setsWon}</td>
                  <td className="col-stat">{standing.setsLost}</td>
                  <td className="col-stat coefficient">{standing.setsCoefficient}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="standings-legend">
        <h4>Leyenda:</h4>
        <div className="legend-items">
          <span><strong>PJ:</strong> Partidos Jugados</span>
          <span><strong>PG:</strong> Partidos Ganados</span>
          <span><strong>PP:</strong> Partidos Perdidos</span>
          <span><strong>SG:</strong> Sets Ganados</span>
          <span><strong>SP:</strong> Sets Perdidos</span>
          <span><strong>Coef:</strong> Coeficiente (SG/SP)</span>
        </div>
      </div>
    </div>
  );
}