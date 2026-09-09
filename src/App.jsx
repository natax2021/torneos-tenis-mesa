import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import localforage from 'localforage';
import BracketView from './BracketView';
import StandingsTable from './StandingsTable';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

function App() {
  const [view, setView] = useState('admin');
  const [tournaments, setTournaments] = useState([]);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [playersDb, setPlayersDb] = useState([]);
  
  const [newTournamentName, setNewTournamentName] = useState('');
  const [newTournamentFormat, setNewTournamentFormat] = useState('eliminacion');
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerRanking, setNewPlayerRanking] = useState(1);
  const [selectedPlayerDbId, setSelectedPlayerDbId] = useState('');

  const [activeMatch, setActiveMatch] = useState(null);
  const [currentSet, setCurrentSet] = useState({ p1: 0, p2: 0 });
  const [sets, setSets] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    fetchTournaments();
    fetchPlayersDb();
    updatePendingCount();
    
    const handleOnline = () => { setIsOnline(true); syncPendingScores(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (selectedTournamentId) {
      fetchPlayers(selectedTournamentId);
      fetchMatches(selectedTournamentId);
    }
  }, [selectedTournamentId]);

  const fetchTournaments = async () => {
    const { data } = await supabase.from('tournaments').select('*').order('created_at', { ascending: false });
    if (data) setTournaments(data);
  };

  const fetchPlayersDb = async () => {
    const { data } = await supabase.from('players_db').select('*').order('name', { ascending: true });
    if (data) setPlayersDb(data);
  };

  const fetchPlayers = async (tournamentId) => {
    const { data } = await supabase.from('players').select('*').eq('tournament_id', tournamentId).order('ranking', { ascending: true });
    if (data) setPlayers(data);
  };

  const fetchMatches = async (tournamentId) => {
    const { data } = await supabase.from('matches').select('*').eq('tournament_id', tournamentId).order('table_number', { ascending: true });
    if (data) setMatches(data);
  };

  const handleCreateTournament = async (e) => {
    e.preventDefault();
    if (!newTournamentName.trim()) return alert('⚠️ Escribe un nombre');
    const { error } = await supabase.from('tournaments').insert([{ name: newTournamentName.trim(), format: newTournamentFormat, best_of: 3 }]);
    if (error) alert('❌ Error: ' + error.message);
    else {
      alert('✅ Torneo creado');
      setNewTournamentName('');
      fetchTournaments();
    }
  };

  const handleDeleteTournament = async (tournamentId) => {
    if (!confirm('⚠️ ¿Estás seguro de eliminar este torneo y todos sus datos?')) return;
    const { error } = await supabase.from('tournaments').delete().eq('id', tournamentId);
    if (error) {
      alert('❌ Error: ' + error.message);
    } else {
      alert('✅ Torneo eliminado');
      if (selectedTournamentId === tournamentId) {
        setSelectedTournamentId('');
        setPlayers([]);
        setMatches([]);
      }
      fetchTournaments();
    }
  };

  const handleAddPlayerToDb = async (e) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return alert('⚠️ Escribe un nombre');
    const { error } = await supabase.from('players_db').insert([{ name: newPlayerName.trim(), ranking: newPlayerRanking }]);
    if (error) {
      if (error.code === '23505') {
        alert('⚠️ Este jugador ya existe en la base de datos');
      } else {
        alert(' Error: ' + error.message);
      }
    } else {
      setNewPlayerName('');
      setNewPlayerRanking(1);
      fetchPlayersDb();
    }
  };

  const handleDeletePlayerFromDb = async (playerId) => {
    if (!confirm('¿Estás seguro de eliminar este jugador de la base de datos?')) return;
    const { error } = await supabase.from('players_db').delete().eq('id', playerId);
    if (error) {
      alert(' Error: ' + error.message);
    } else {
      fetchPlayersDb();
    }
  };

  const handleAddPlayerFromDb = async () => {
    if (!selectedPlayerDbId || !selectedTournamentId) {
      return alert('️ Selecciona un jugador y un torneo');
    }
    const selectedPlayer = playersDb.find(p => p.id === selectedPlayerDbId);
    if (!selectedPlayer) return;
    const alreadyInTournament = players.find(p => p.name === selectedPlayer.name);
    if (alreadyInTournament) {
      return alert('⚠️ Este jugador ya está en el torneo');
    }
    const { error } = await supabase.from('players').insert([{ 
      name: selectedPlayer.name, 
      ranking: selectedPlayer.ranking, 
      tournament_id: selectedTournamentId 
    }]);
    if (error) {
      alert('❌ Error: ' + error.message);
    } else {
      setSelectedPlayerDbId('');
      fetchPlayers(selectedTournamentId);
    }
  };

  const handleRemovePlayerFromTournament = async (playerId) => {
    if (!confirm('¿Eliminar este jugador del torneo?')) return;
    const { error } = await supabase.from('players').delete().eq('id', playerId);
    if (error) {
      alert('❌ Error: ' + error.message);
    } else {
      fetchPlayers(selectedTournamentId);
    }
  };

  const generateSeedOrder = (bracketSize) => {
    if (bracketSize === 2) return [1, 2];
    if (bracketSize === 4) return [1, 4, 2, 3];
    if (bracketSize === 8) return [1, 8, 4, 5, 2, 7, 3, 6];
    if (bracketSize === 16) return [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11];
    const order = [1, 2];
    while (order.length < bracketSize) {
      const newOrder = [];
      const nextSize = order.length * 2;
      for (let i = 0; i < order.length; i++) {
        newOrder.push(order[i]);
        newOrder.push(nextSize + 1 - order[i]);
      }
      order.length = 0;
      order.push(...newOrder);
    }
    return order;
  };

  const getRoundName = (roundNum, matchesInRound) => {
    if (matchesInRound === 1) return 'Final';
    if (matchesInRound === 2) return 'Semifinales';
    if (matchesInRound === 4) return 'Cuartos de Final';
    if (matchesInRound === 8) return 'Octavos de Final';
    if (matchesInRound === 16) return 'Dieciseisavos';
    return `Ronda ${roundNum}`;
  };

  const generateEliminationBracket = async () => {
    if (players.length < 2) return alert('⚠️ Necesitas al menos 2 jugadores');
    await supabase.from('matches').delete().eq('tournament_id', selectedTournamentId);

    const sorted = [...players].sort((a, b) => a.ranking - b.ranking);
    const n = sorted.length;
    
    let size = 2;
    while (size < n) size *= 2;
    
    const totalRounds = Math.log2(size);
    let tableNumber = 1;

    const roundsData = [];
    for (let round = 1; round <= totalRounds; round++) {
      const matchesInThisRound = Math.pow(2, totalRounds - round);
      const roundName = getRoundName(round, matchesInThisRound);
      const roundMatches = [];

      for (let i = 0; i < matchesInThisRound; i++) {
        roundMatches.push({
          tournament_id: selectedTournamentId,
          player1_id: null,
          player2_id: null,
          winner_id: null,
          status: 'pending',
          round: roundName,
          table_number: tableNumber++,
          round_number: round,
          next_match_id: null,
          slot: null
        });
      }
      roundsData.push(roundMatches);
    }

    const firstRound = roundsData[0];
    const seedOrder = generateSeedOrder(size);

    for (let i = 0; i < firstRound.length; i++) {
      const seed1 = seedOrder[i * 2];
      const seed2 = seedOrder[i * 2 + 1];
      
      const player1 = seed1 <= n ? sorted[seed1 - 1] : null;
      const player2 = seed2 <= n ? sorted[seed2 - 1] : null;

      let winnerId = null;
      let status = 'pending';
      
      if (player1 && !player2) {
        winnerId = player1.id;
        status = 'completed';
      } else if (!player1 && player2) {
        winnerId = player2.id;
        status = 'completed';
      }

      firstRound[i].player1_id = player1?.id || null;
      firstRound[i].player2_id = player2?.id || null;
      firstRound[i].winner_id = winnerId;
      firstRound[i].status = status;
    }

    for (let round = 0; round < totalRounds - 1; round++) {
      const currentRound = roundsData[round];
      const nextRound = roundsData[round + 1];

      for (let i = 0; i < currentRound.length; i++) {
        const match = currentRound[i];
        if (match.status === 'completed' && match.winner_id) {
          const nextMatchIndex = Math.floor(i / 2);
          const slot = (i % 2) + 1;
          if (slot === 1) {
            nextRound[nextMatchIndex].player1_id = match.winner_id;
          } else {
            nextRound[nextMatchIndex].player2_id = match.winner_id;
          }
        }
      }
    }

    const flatMatches = roundsData.flat();
    const { data: insertedMatches, error } = await supabase
      .from('matches')
      .insert(flatMatches)
      .select('id, round_number, table_number');
    
    if (error) {
      alert('❌ Error al insertar partidos: ' + error.message);
      return;
    }

    const updates = [];
    for (let round = 0; round < totalRounds - 1; round++) {
      const currentRoundMatches = insertedMatches.filter(m => m.round_number === round + 1);
      const nextRoundMatches = insertedMatches.filter(m => m.round_number === round + 2);

      for (let i = 0; i < currentRoundMatches.length; i++) {
        const nextMatchIndex = Math.floor(i / 2);
        const slot = (i % 2) + 1;
        const nextMatchId = nextRoundMatches[nextMatchIndex].id;

        updates.push({
          id: currentRoundMatches[i].id,
          next_match_id: nextMatchId,
          slot: slot
        });
      }
    }

    if (updates.length > 0) {
      await supabase.from('matches').upsert(updates, { onConflict: 'id' });
    }

    const numByes = size - n;
    alert(`✅ Cuadro completo generado:\n\n${n} jugadores\n${numByes} BYEs\n${totalRounds} rondas totales\nTotal partidos: ${flatMatches.length}`);
    fetchMatches(selectedTournamentId);
  };

  const generateRoundRobin = async () => {
    if (players.length < 2) return alert('⚠️ Necesitas al menos 2 jugadores');
    await supabase.from('matches').delete().eq('tournament_id', selectedTournamentId);

    const sorted = [...players].sort((a, b) => a.ranking - b.ranking);
    let n = sorted.length;
    const playersList = n % 2 === 0 ? [...sorted] : [...sorted, { id: 'BYE', name: 'BYE' }];
    const totalPlayers = playersList.length;
    const numRounds = totalPlayers - 1;
    const matchesPerRound = totalPlayers / 2;
    
    const matchesToCreate = [];
    let tableNum = 1;
    const fixed = playersList[0];
    const rotating = playersList.slice(1);
    
    for (let round = 0; round < numRounds; round++) {
      const currentRound = [fixed, ...rotating];
      for (let i = 0; i < matchesPerRound; i++) {
        const player1 = currentRound[i];
        const player2 = currentRound[totalPlayers - 1 - i];
        if (player1.id !== 'BYE' && player2.id !== 'BYE') {
          matchesToCreate.push({
            tournament_id: selectedTournamentId,
            player1_id: player1.id,
            player2_id: player2.id,
            winner_id: null,
            status: 'pending',
            round: `Ronda ${round + 1}`,
            table_number: tableNum++,
            round_number: round + 1
          });
        }
      }
      rotating.unshift(rotating.pop());
    }

    const { error } = await supabase.from('matches').insert(matchesToCreate);
    if (error) alert('❌ Error: ' + error.message);
    else {
      alert(`✅ Calendario generado: ${matchesToCreate.length} partidos`);
      fetchMatches(selectedTournamentId);
    }
  };

  const handleGenerateBracket = async () => {
    const tournament = tournaments.find(t => t.id === selectedTournamentId);
    if (!tournament) return;
    if (tournament.format === 'eliminacion') generateEliminationBracket();
    else if (tournament.format === 'round_robin') generateRoundRobin();
  };

  const getPlayerName = (playerId) => {
    if (!playerId) return 'TBD';
    const player = players.find(p => p.id === playerId);
    return player ? player.name : 'Desconocido';
  };

  const openRefereeView = (match) => {
    if (match.status === 'completed') return alert('⚠️ Este partido ya fue finalizado.');
    if (!match.player1_id || !match.player2_id) return alert('⚠️ Este partido aún no tiene jugadores definidos.');
    setActiveMatch(match);
    setCurrentSet({ p1: 0, p2: 0 });
    setSets([]);
  };

  const addPoint = (player) => {
    const newSet = { ...currentSet };
    newSet[player] += 1;
    if ((newSet.p1 >= 11 || newSet.p2 >= 11) && Math.abs(newSet.p1 - newSet.p2) >= 2) {
      setSets([...sets, newSet]);
      setCurrentSet({ p1: 0, p2: 0 });
    } else {
      setCurrentSet(newSet);
    }
  };

  const saveMatchResult = async () => {
    const finalSets = [...sets, currentSet].filter(s => s.p1 > 0 || s.p2 > 0);
    if (finalSets.length === 0) return alert('⚠️ El partido no ha comenzado');

    const p1SetsWon = finalSets.filter(s => s.p1 > s.p2).length;
    const p2SetsWon = finalSets.filter(s => s.p2 > s.p1).length;
    const winnerId = p1SetsWon > p2SetsWon ? activeMatch.player1_id : activeMatch.player2_id;

    const payload = { matchId: activeMatch.id, winnerId, sets: finalSets, timestamp: new Date().toISOString() };

    if (isOnline) await sendToSupabase(payload);
    else {
      await localforage.setItem(`pending_match_${activeMatch.id}_${Date.now()}`, payload);
      alert('💾 Sin conexión. Resultado guardado.');
      updatePendingCount();
    }
    
    setActiveMatch(null);
    fetchMatches(selectedTournamentId);
  };

  const sendToSupabase = async (payload) => {
    try {
      await supabase.from('matches').update({ status: 'completed', winner_id: payload.winnerId }).eq('id', payload.matchId);
      
      const setsToInsert = payload.sets.map(s => ({ match_id: payload.matchId, player1_score: s.p1, player2_score: s.p2 }));
      await supabase.from('sets').insert(setsToInsert);

      const { data: currentMatch } = await supabase.from('matches').select('next_match_id, slot').eq('id', payload.matchId).single();
      
      if (currentMatch && currentMatch.next_match_id) {
        const updateData = {};
        if (currentMatch.slot === 1) {
          updateData.player1_id = payload.winnerId;
        } else if (currentMatch.slot === 2) {
          updateData.player2_id = payload.winnerId;
        }
        
        await supabase.from('matches').update(updateData).eq('id', currentMatch.next_match_id);
      }

      alert('✅ Resultado enviado. Ganador avanza a la siguiente ronda.');
    } catch (error) {
      console.error('Error:', error);
      await localforage.setItem(`pending_match_${payload.matchId}_${Date.now()}`, payload);
      updatePendingCount();
    }
  };

  const updatePendingCount = async () => {
    const keys = await localforage.keys();
    setPendingCount(keys.filter(k => k.startsWith('pending_match_')).length);
  };

  const syncPendingScores = async () => {
    const keys = await localforage.keys();
    let synced = 0;
    for (const key of keys) {
      if (key.startsWith('pending_match_')) {
        const payload = await localforage.getItem(key);
        await sendToSupabase(payload);
        await localforage.removeItem(key);
        synced++;
      }
    }
    if (synced > 0) {
      alert(`🔄 Sincronizados ${synced} partidos.`);
      updatePendingCount();
      if (selectedTournamentId) fetchMatches(selectedTournamentId);
    }
  };

  // --- FUNCIONES DE EXPORTACIÓN ---

    const exportBracketToPDF = () => {
    if (matches.length === 0) return alert('⚠️ No hay partidos para exportar');
    
    try {
      const tournament = tournaments.find(t => t.id === selectedTournamentId);
      
      const rounds = {};
      matches.forEach(m => {
        if (!rounds[m.round_number]) rounds[m.round_number] = [];
        rounds[m.round_number].push(m);
      });
      
      const roundNumbers = Object.keys(rounds).map(Number).sort((a, b) => a - b);
      const totalRounds = roundNumbers.length;
      
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      
      doc.setFontSize(24);
      doc.setTextColor(30, 58, 138);
      doc.setFont(undefined, 'bold');
      doc.text(`TORNEO: ${tournament?.name || 'Sin nombre'}`, 14, 20);
      
      doc.setFontSize(12);
      doc.setTextColor(100, 116, 139);
      doc.setFont(undefined, 'normal');
      doc.text(`Formato: ${tournament?.format === 'eliminacion' ? 'Eliminación Directa' : 'Todos contra Todos'}`, 14, 28);
      doc.text(`Fecha: ${new Date().toLocaleDateString('es-ES')} | Jugadores: ${players.length}`, 14, 34);
      
      const roundWidth = 70;
      const matchHeight = 35;
      const startX = 20;
      const startY = 45;
      
      roundNumbers.forEach((roundNum, roundIndex) => {
        const roundMatches = rounds[roundNum];
        const roundName = roundMatches[0]?.round || `Ronda ${roundNum}`;
        const xPos = startX + (roundIndex * roundWidth);
        
        doc.setFontSize(14);
        doc.setTextColor(30, 58, 138);
        doc.setFont(undefined, 'bold');
        doc.text(roundName.toUpperCase(), xPos, startY);
        
        doc.setDrawColor(59, 130, 246);
        doc.setLineWidth(0.5);
        doc.line(xPos, startY + 2, xPos + 60, startY + 2);
        
        roundMatches.forEach((match, matchIndex) => {
          const yPos = startY + 10 + (matchIndex * (matchHeight + 15));
          const p1Name = getPlayerName(match.player1_id);
          const p2Name = getPlayerName(match.player2_id);
          const p1Won = match.status === 'completed' && match.winner_id === match.player1_id;
          const p2Won = match.status === 'completed' && match.winner_id === match.player2_id;
          
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.5);
          doc.roundedRect(xPos, yPos, 65, matchHeight, 3, 3, 'FD');
          
          doc.setFontSize(10);
          if (p1Won) {
            doc.setTextColor(22, 163, 74);
            doc.setFont(undefined, 'bold');
          } else {
            doc.setTextColor(100, 116, 139);
            doc.setFont(undefined, 'normal');
          }
          doc.text(p1Name.substring(0, 20), xPos + 3, yPos + 10);
          
          if (match.status === 'completed') {
            // CORRECCIÓN AQUÍ: Usar ternario para cada argumento por separado
            doc.setFillColor(p1Won ? 22 : 241, p1Won ? 163 : 245, p1Won ? 74 : 249);
            doc.roundedRect(xPos + 52, yPos + 5, 10, 8, 2, 2, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont(undefined, 'bold');
            doc.text(p1Won ? '1' : '0', xPos + 57, yPos + 11);
          }
          
          if (p2Won) {
            doc.setTextColor(22, 163, 74);
            doc.setFont(undefined, 'bold');
          } else {
            doc.setTextColor(100, 116, 139);
            doc.setFont(undefined, 'normal');
          }
          doc.text(p2Name.substring(0, 20), xPos + 3, yPos + 22);
          
          if (match.status === 'completed') {
            // CORRECCIÓN AQUÍ: Usar ternario para cada argumento por separado
            doc.setFillColor(p2Won ? 22 : 241, p2Won ? 163 : 245, p2Won ? 74 : 249);
            doc.roundedRect(xPos + 52, yPos + 17, 10, 8, 2, 2, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont(undefined, 'bold');
            doc.text(p2Won ? '1' : '0', xPos + 57, yPos + 23);
          }
          
          if (roundIndex < totalRounds - 1) {
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.3);
            
            doc.line(xPos + 65, yPos + (matchHeight / 2), xPos + 72, yPos + (matchHeight / 2));
            
            if (matchIndex % 2 === 0) {
              const nextRoundY = startY + 10 + (Math.floor(matchIndex / 2) * (matchHeight + 15));
              doc.line(xPos + 72, yPos + (matchHeight / 2), xPos + 72, nextRoundY + (matchHeight / 2));
              doc.line(xPos + 72, nextRoundY + (matchHeight / 2), xPos + roundWidth, nextRoundY + (matchHeight / 2));
            }
          }
          
          if (match.status === 'completed') {
            const winnerName = p1Won ? p1Name : p2Name;
            doc.setFontSize(8);
            doc.setTextColor(59, 130, 246);
            doc.setFont(undefined, 'italic');
            doc.text(`→ ${winnerName.substring(0, 15)}`, xPos + 3, yPos + matchHeight - 3);
          }
        });
      });
      
      const fileName = `bracket-${tournament?.name?.replace(/\s+/g, '-') || 'torneo'}.pdf`;
      doc.save(fileName);
      alert('✅ PDF del bracket exportado correctamente');
    } catch (error) {
      console.error('Error al generar PDF:', error);
      alert('❌ Error al generar PDF: ' + error.message);
    }
  };

  const exportStandingsToExcel = () => {
    if (matches.length === 0) return alert('⚠️ No hay partidos para exportar');
    
    try {
      const standings = players.map(player => {
        const playerMatches = matches.filter(m => 
          m.status === 'completed' && 
          (m.player1_id === player.id || m.player2_id === player.id)
        );
        
        const matchesPlayed = playerMatches.length;
        const matchesWon = playerMatches.filter(m => m.winner_id === player.id).length;
        const matchesLost = matchesPlayed - matchesWon;
        
        return {
          'Jugador': player.name,
          'Ranking': player.ranking,
          'PJ': matchesPlayed,
          'PG': matchesWon,
          'PP': matchesLost,
          '% Victoria': matchesPlayed > 0 ? ((matchesWon / matchesPlayed) * 100).toFixed(1) + '%' : '0%'
        };
      });
      
      standings.sort((a, b) => b.PG - a.PG);
      
      const tournament = tournaments.find(t => t.id === selectedTournamentId);
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(standings);
      
      ws['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 15 }];
      
      XLSX.utils.book_append_sheet(wb, ws, 'Posiciones');
      
      const fileName = `posiciones-${tournament?.name?.replace(/\s+/g, '-') || 'torneo'}.xlsx`;
      XLSX.writeFile(wb, fileName);
      alert('✅ Excel exportado correctamente');
    } catch (error) {
      console.error('Error al generar Excel:', error);
      alert('❌ Error al generar Excel: ' + error.message);
    }
  };

  const shareViaWhatsApp = () => {
    if (matches.length === 0) return alert('⚠️ No hay partidos para compartir');
    
    const tournament = tournaments.find(t => t.id === selectedTournamentId);
    const completedMatches = matches.filter(m => m.status === 'completed');
    const pendingMatches = matches.filter(m => m.status === 'pending');
    
    let message = `🏓 *TORNEO: ${tournament?.name || 'Sin nombre'}*\n\n`;
    message += ` *Resumen:*\n`;
    message += `• Jugadores: ${players.length}\n`;
    message += `• Partidos jugados: ${completedMatches.length}\n`;
    message += `• Partidos pendientes: ${pendingMatches.length}\n\n`;
    
    if (completedMatches.length > 0) {
      message += `✅ *Partidos Finalizados:*\n`;
      completedMatches.forEach(m => {
        message += `• ${m.round} - ${getPlayerName(m.player1_id)} vs ${getPlayerName(m.player2_id)} → Ganador: ${getPlayerName(m.winner_id)}\n`;
      });
    }
    
    if (pendingMatches.length > 0) {
      message += `\n⏳ *Partidos Pendientes:*\n`;
      pendingMatches.forEach(m => {
        message += `• ${m.round} - ${getPlayerName(m.player1_id)} vs ${getPlayerName(m.player2_id)}\n`;
      });
    }
    
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
    
    window.open(whatsappUrl, '_blank');
  };

  // --- VISTAS ---

  if (view === 'referee' && activeMatch) {
    const p1Name = getPlayerName(activeMatch.player1_id);
    const p2Name = getPlayerName(activeMatch.player2_id);

    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '500px', margin: '0 auto', padding: '20px', background: '#f8fafc', minHeight: '100vh' }}>
        <button onClick={() => setActiveMatch(null)} style={{ marginBottom: '20px', padding: '10px', background: '#e2e8f0', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>← Volver</button>
        <div style={{ background: isOnline ? '#dcfce7' : '#fee2e2', color: isOnline ? '#166534' : '#991b1b', padding: '10px', borderRadius: '6px', textAlign: 'center', fontWeight: 'bold', marginBottom: '20px' }}>
          {isOnline ? '🟢 En línea' : '🔴 MODO OFFLINE'}
          {pendingCount > 0 && <span style={{ marginLeft: '10px', background: '#991b1b', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '12px' }}>{pendingCount} pendientes</span>}
        </div>
        <h2 style={{ textAlign: 'center', color: '#1e3a8a' }}>Mesa {activeMatch.table_number} - {activeMatch.round}</h2>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <h3 style={{ color: '#2563eb', fontSize: '20px' }}>{p1Name}</h3>
            <div style={{ fontSize: '64px', fontWeight: 'bold', color: '#1e3a8a' }}>{currentSet.p1}</div>
            <button onClick={() => addPoint('p1')} style={{ width: '100%', padding: '20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '12px', fontSize: '24px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>+ PUNTO</button>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#94a3b8', padding: '0 20px' }}>VS</div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <h3 style={{ color: '#dc2626', fontSize: '20px' }}>{p2Name}</h3>
            <div style={{ fontSize: '64px', fontWeight: 'bold', color: '#991b1b' }}>{currentSet.p2}</div>
            <button onClick={() => addPoint('p2')} style={{ width: '100%', padding: '20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '12px', fontSize: '24px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>+ PUNTO</button>
          </div>
        </div>
        {sets.length > 0 && (
          <div style={{ background: 'white', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#64748b' }}>SETS:</h4>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {sets.map((s, i) => (
                <div key={i} style={{ background: '#f1f5f9', padding: '8px 12px', borderRadius: '6px', fontWeight: 'bold' }}>
                  Set {i + 1}: <span style={{ color: '#2563eb' }}>{s.p1}</span> - <span style={{ color: '#dc2626' }}>{s.p2}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <button onClick={saveMatchResult} disabled={sets.length === 0 && currentSet.p1 === 0 && currentSet.p2 === 0} style={{ width: '100%', padding: '18px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '12px', fontSize: '20px', fontWeight: 'bold', cursor: 'pointer', opacity: (sets.length === 0 && currentSet.p1 === 0 && currentSet.p2 === 0) ? 0.5 : 1 }}>FINALIZAR PARTIDO</button>
      </div>
    );
  }

  if (view === 'bracket') {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h1 style={{ color: '#1e3a8a', margin: 0 }}>🏆 Cuadro del Torneo</h1>
          <button onClick={() => setView('admin')} style={{ padding: '10px 20px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>← Volver</button>
        </div>
        {matches.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: '#f8fafc', borderRadius: '12px' }}>
            <p style={{ fontSize: '18px', color: '#64748b' }}>No hay partidos generados aún.</p>
          </div>
        ) : (
          <BracketView matches={matches} players={players} onMatchClick={(match) => { if (match.status !== 'completed') { openRefereeView(match); setView('referee'); } }} />
        )}
      </div>
    );
  }

  if (view === 'standings') {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <h1 style={{ color: '#1e3a8a', margin: 0 }}>📊 Clasificación del Torneo</h1>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={exportStandingsToExcel} style={{ padding: '10px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>📊 Excel</button>
            <button onClick={shareViaWhatsApp} style={{ padding: '10px 20px', background: '#25d366', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>📱 WhatsApp</button>
          </div>
          <button onClick={() => setView('admin')} style={{ padding: '10px 20px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>← Volver</button>
        </div>
        {matches.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: '#f8fafc', borderRadius: '12px' }}>
            <p style={{ fontSize: '18px', color: '#64748b' }}>No hay partidos jugados aún.</p>
          </div>
        ) : (
          <StandingsTable matches={matches} players={players} />
        )}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h1 style={{ color: '#1e3a8a', margin: 0 }}>🏓 Gestor de Torneos</h1>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => setView('standings')} style={{ padding: '10px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>📊 Posiciones</button>
          <button onClick={() => setView('bracket')} style={{ padding: '10px 20px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>🏆 Bracket</button>
          <button onClick={() => setView('referee')} style={{ padding: '10px 20px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>⚖️ Árbitro</button>
        </div>
      </div>

      <section style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
        <h2>1. Crear Torneo</h2>
        <form onSubmit={handleCreateTournament}>
          <input type="text" placeholder="Nombre del Torneo" value={newTournamentName} onChange={(e) => setNewTournamentName(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
          <select value={newTournamentFormat} onChange={(e) => setNewTournamentFormat(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
            <option value="eliminacion">🏆 Eliminación Directa</option>
            <option value="round_robin">🔄 Todos contra Todos</option>
          </select>
          <button type="submit" style={{ width: '100%', padding: '14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Crear Torneo</button>
        </form>
      </section>

      <section style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
        <h2>2. Base de Datos de Jugadores</h2>
        <form onSubmit={handleAddPlayerToDb} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <input type="text" placeholder="Nombre del jugador" value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} style={{ flex: 2, padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
          <input type="number" placeholder="Ranking" value={newPlayerRanking} onChange={(e) => setNewPlayerRanking(Number(e.target.value))} style={{ flex: 1, padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }} min="1" />
          <button type="submit" style={{ padding: '12px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Agregar a BD</button>
        </form>

        <div style={{ maxHeight: '200px', overflowY: 'auto', background: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          {playersDb.length === 0 ? (
            <p style={{ color: '#64748b', textAlign: 'center' }}>No hay jugadores en la base de datos.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {playersDb.map((p) => (
                <li key={p.id} style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><strong>{p.name}</strong> <span style={{ color: '#64748b', fontSize: '12px' }}>(Ranking: {p.ranking})</span></span>
                  <button onClick={() => handleDeletePlayerFromDb(p.id)} style={{ padding: '4px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>🗑️ Eliminar</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {tournaments.length > 0 && (
        <section style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
          <h2>3. Gestionar Torneos</h2>
          <select value={selectedTournamentId} onChange={(e) => setSelectedTournamentId(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '20px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
            <option value="">-- Selecciona un torneo --</option>
            {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          {selectedTournamentId && (
            <>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <select value={selectedPlayerDbId} onChange={(e) => setSelectedPlayerDbId(e.target.value)} style={{ flex: 2, padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <option value="">-- Selecciona jugador de la BD --</option>
                  {playersDb.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button onClick={handleAddPlayerFromDb} style={{ padding: '12px 20px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Agregar al Torneo</button>
              </div>

              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '300px' }}>
                  <h3>Jugadores en Torneo ({players.length})</h3>
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {players.map((p) => (
                      <li key={p.id} style={{ background: 'white', padding: '10px', marginBottom: '8px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span><span style={{ background: '#dbeafe', color: '#1e40af', borderRadius: '50%', width: '28px', height: '28px', display: 'inline-block', textAlign: 'center', lineHeight: '28px', fontWeight: 'bold', marginRight: '10px' }}>{p.ranking}</span>{p.name}</span>
                        <button onClick={() => handleRemovePlayerFromTournament(p.id)} style={{ padding: '4px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Eliminar</button>
                      </li>
                    ))}
                  </ul>
                  {players.length >= 2 && (
                    <button onClick={handleGenerateBracket} style={{ width: '100%', padding: '14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                      🏆 GENERAR {tournaments.find(t => t.id === selectedTournamentId)?.format === 'round_robin' ? 'CALENDARIO' : 'CUADRO'}
                    </button>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: '300px' }}>
                  <h3>Partidos ({matches.length})</h3>
                  {matches.length === 0 ? <p style={{ color: '#64748b' }}>Genera el cuadro primero.</p> : (
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {matches.map((match) => (
                        <div key={match.id} style={{ background: match.status === 'completed' ? '#dcfce7' : 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <strong>Mesa {match.table_number} - {match.round}</strong>
                            <div style={{ fontSize: '14px', color: '#64748b' }}>{getPlayerName(match.player1_id)} vs {getPlayerName(match.player2_id)}</div>
                          </div>
                          <button onClick={() => openRefereeView(match)} disabled={match.status === 'completed' || !match.player1_id || !match.player2_id} style={{ padding: '8px 16px', background: match.status === 'completed' ? '#94a3b8' : (!match.player1_id || !match.player2_id ? '#cbd5e1' : '#7c3aed'), color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                            {match.status === 'completed' ? '✅' : (!match.player1_id || !match.player2_id ? '⏳' : '⚖️')}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {matches.length > 0 && (
                <div style={{ marginTop: '20px', padding: '15px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                  <h4 style={{ margin: '0 0 15px 0', color: '#1e40af' }}>📤 Exportar Resultados</h4>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button onClick={exportBracketToPDF} style={{ flex: 1, padding: '12px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                      📄 Exportar Bracket a PDF
                    </button>
                    <button onClick={exportStandingsToExcel} style={{ flex: 1, padding: '12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                      📊 Exportar Tabla a Excel
                    </button>
                    <button onClick={shareViaWhatsApp} style={{ flex: 1, padding: '12px', background: '#25d366', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                      📱 Compartir por WhatsApp
                    </button>
                  </div>
                </div>
              )}

              <div style={{ marginTop: '20px', padding: '15px', background: '#fee2e2', borderRadius: '8px', border: '1px solid #ef4444' }}>
                <button onClick={() => handleDeleteTournament(selectedTournamentId)} style={{ width: '100%', padding: '12px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                  ️ ELIMINAR TORNEO
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

export default App;