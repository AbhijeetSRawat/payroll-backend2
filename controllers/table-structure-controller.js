import TableStructure from '../models/TableStructure.js';

export const createTableStructure = async (req, res) => {
  try {
    const { name, columnNames, company } = req.body;

    const tableStructure = await TableStructure.create({
      name,
      columnNames,
      company,
      createdBy: req.user.id // from middleware
    });

    res.status(201).json({ success: true, data: tableStructure });
  } catch (err) {
    console.error('Create TableStructure Error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getCompanyTableStructures = async (req, res) => {
  try {
    const { companyId } = req.params;

    const tables = await TableStructure.find({ company: companyId })
      .populate('createdBy')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: tables });
  } catch (err) {
    console.error('Get TableStructures Error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const updateTableStructure = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, columnNames } = req.body;

    const updated = await TableStructure.findByIdAndUpdate(
      id,
      { name, columnNames },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Table structure not found' });
    }

    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error('Update TableStructure Error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const deleteTableStructure = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await TableStructure.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Table structure not found' });
    }

    res.status(200).json({ success: true, message: 'Table structure deleted successfully' });
  } catch (err) {
    console.error('Delete TableStructure Error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
