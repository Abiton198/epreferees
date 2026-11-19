import React, { useState } from 'react';
import { Star } from 'lucide-react';

interface Props {
    value: number;
    onChange: (rating: number) => void;
    label?: string;
    required?: boolean;
}

const RATING_LABELS: Record<number, string> = {
    1: '1 - Below Standard (Needs Immediate Coaching)',
    2: '2 - Developing (Key Law/Management Gaps)',
    3: '3 - Competent (Meets Level Expectation)',
    4: '4 - Strong Performance (Consistent & Clear)',
    5: '5 - Exceptional (Ready for Higher Panel)',
};

const StarRatingInput: React.FC<Props> = ({
    value,
    onChange,
    label = 'Overall Match Rating',
    required = true,
}) => {
    const [hovered, setHovered] = useState<number>(0);
    const activeRating = hovered || value;

    return (
        <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-800 flex items-center gap-1">
                {label}
                {required && <span className="text-red-500">*</span>}
            </label>

            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
                    {[1, 2, 3, 4, 5].map((star) => {
                        const filled = star <= activeRating;
                        return (
                            <button
                                key={star}
                                type="button"
                                onMouseEnter={() => setHovered(star)}
                                onMouseLeave={() => setHovered(0)}
                                onClick={() => onChange(star)}
                                className="p-1 rounded focus:outline-none focus:ring-2 focus:ring-[#006747] transition-transform hover:scale-110"
                                aria-label={`${star} Star${star > 1 ? 's' : ''}`}
                            >
                                <Star
                                    size={28}
                                    className={
                                        filled
                                            ? 'fill-amber-400 text-amber-400'
                                            : 'text-gray-300 hover:text-amber-300'
                                    }
                                />
                            </button>
                        );
                    })}
                </div>

                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200">
                    {activeRating > 0 ? RATING_LABELS[activeRating] : 'Select a rating (1–5)'}
                </span>
            </div>
        </div>
    );
};

export default StarRatingInput;