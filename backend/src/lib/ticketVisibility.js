function ticketVisibilityWhere(user) {
  if (user.permissions.has('view_all_tickets')) {
    return {};
  }
  if (user.permissions.has('view_sector_tickets')) {
    return { OR: [{ sectorId: user.sectorId }, { assignedToId: user.id }] };
  }
  return { requesterId: user.id };
}

module.exports = { ticketVisibilityWhere };
