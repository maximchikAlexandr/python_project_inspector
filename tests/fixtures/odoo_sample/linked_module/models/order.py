class fields:
    """Minimal stub so the analyzer can parse relational fields."""

    @staticmethod
    def Char():
        """Return a char field placeholder."""
        return None

    @staticmethod
    def Many2one(comodel_name):
        """Return a many2one field placeholder."""
        return comodel_name


class LinkedOrder:
    """Order model coupled to base.partner."""

    _name = "linked.order"

    partner_id = fields.Many2one("base.partner")
