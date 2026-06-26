function ticketVisibilityWhere(user) {
  if (user.permissions.has('view_all_tickets')) {
    return {};
  }
  if (user.permissions.has('view_sector_tickets')) {
    const visibleSectorIds = [user.sectorId, ...(user.memberSectorIds ?? [])].filter(Boolean);
    return {
      OR: [
        { sectorId: { in: visibleSectorIds } },
        { assignedToId: user.id },
      ],
    };
  }
  return { requesterId: user.id };
}

module.exports = { ticketVisibilityWhere };
