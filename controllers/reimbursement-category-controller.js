import ReimbursementCategory from "../models/ReimbursementCategory.js";

export const createCategory = async (req, res) => {
  
  try {
    const { name, description, companyId, createdBy } = req.body;

    // 1. Trim and normalize inputs
    const trimmedName = name.trim();
    const trimmedDescription = description?.trim();

    // 2. Explicit duplicate check (more reliable than waiting for 11000 error)
    const existingCategory = await ReimbursementCategory.findOne({
      company: companyId,
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') }
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category with this name already exists for this company"
      });
    }

    // 3. Create with trimmed values
    const category = await ReimbursementCategory.create({
      name: trimmedName,
      description: trimmedDescription,
      company: companyId,
      createdBy
    });

    res.status(201).json({ success: true, data: category });
  } catch (err) {
    console.error("Error creating category:", err);
    
    // Fallback duplicate check (in case our explicit check missed something)
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Category already exists for this company"
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// ✅ Get All Categories for a Company
export const getAllCategories = async (req, res) => {
  try {
    const { companyId } = req.params;

    const categories = await ReimbursementCategory.find({ company: companyId })
      .collation({ locale: "en", strength: 2 }) // case-insensitive sorting
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: categories });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ Update Category
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, createdBy, companyId } = req.body;

    // Try update
    const category = await ReimbursementCategory.findByIdAndUpdate(
      id,
      { name, description, createdBy },
      { new: true, runValidators: true, context: "query" }
    ).collation({ locale: "en", strength: 2 });

    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    res.status(200).json({ success: true, data: category });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Another category with this name already exists in the company"
      });
    }
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ Delete Category
// export const deleteCategory = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const category = await ReimbursementCategory.findByIdAndDelete(id);

//     if (!category) {
//       return res.status(404).json({ success: false, message: "Category not found" });
//     }

//     res.status(200).json({ success: true, message: "Category deleted successfully" });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// };


// export const deleteCategory = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const category = await ReimbursementCategory.findByIdAndDelete(id);

//     if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

//     res.status(200).json({ success: true, message: 'Category deleted successfully' });
//   } catch (err) {
//     res.status(500).json({ success: false, message: 'Server error' });
//   }
// };
